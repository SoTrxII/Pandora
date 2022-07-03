import * as EventEmitter from "events";
import {
  BrokerError,
  IController,
  IControllerState,
  IRecordAttemptInfo,
  RECORD_EVENT,
} from "../../bot-control.types";
import { Message, TextableChannel } from "eris";
import { IBotImpl } from "./command-broker-external-api";
import { ChannelType } from "discord-api-types/v10";
import { injectable } from "inversify";

/**
 * Controlling the bot with classic commands
 */
@injectable()
export class CommandBroker extends EventEmitter implements IController {
  /** Class identifier, used to prevent using reflection on the class name which can be flaky */
  private static readonly CLASS_ID = "COMMAND";
  /** Last message having triggered a command */
  private messageBuffer: Message<TextableChannel>;
  /** This controller state*/
  private state: ICommandBrokerState;
  /** Bot framework specific functions */
  private boImpl: IBotImpl;

  constructor(
    /** Prefix for text commands */
    private readonly cmdPrefix: string,
    private readonly clientProvider: () => Promise<IBotImpl>,
    /** Bot text commands */
    private readonly botCommands: {
      start: string;
      end: string;
    }
  ) {
    super();
  }

  async start(): Promise<void> {
    this.boImpl = await this.clientProvider();

    // Get rid as soon as possible of the Eris Message
    this.boImpl.on("messageCreate", async (m) => {
      if (await this.isMsgProcessable(m.content, m.member.id)) {
        return this.processMessage(
          m.id,
          m.channel.id,
          this.getMsgTrigger(m.content),
          {
            voiceChannelId: m.member?.voiceState?.channelID,
            id: m.member.id,
            username: m.member.username,
          }
        );
      }
    });
    return Promise.resolve(undefined);
  }

  /**
   * Get the trigger (command name) contained in the message.
   * Return undefined if none are found
   * @param content
   */
  getMsgTrigger(content: string): string | undefined {
    return content?.substring(this.cmdPrefix.length)?.split(/\s+/)?.[0];
  }

  /**
   * Returns true if the message can be processed as a command message
   * @param content
   * @param authorId
   */
  async isMsgProcessable(content: string, authorId: string): Promise<boolean> {
    // Is the message a command from a valid author ?
    const metaCondition =
      this.isCommand(content) && !(await this.isAuthorSelf(authorId));
    const trigger = this.getMsgTrigger(content);
    // Is the message an existing command ?
    const triggerCondition =
      trigger !== undefined &&
      Object.values(this.botCommands).some((command) => command === trigger);

    return metaCondition && triggerCondition;
  }

  /**
   * Process an incoming message
   * @param m
   */
  async processMessage(
    id: string,
    textChannelId: string,
    trigger: string,
    author: {
      id: string;
      voiceChannelId: string | undefined;
      username: string;
    }
  ): Promise<void> {
    switch (trigger) {
      case this.botCommands.start:
        try {
          await this.attemptStartEvent(
            textChannelId,
            id,
            author.voiceChannelId ?? undefined
          );
          this.state = {
            name: CommandBroker.CLASS_ID,
            data: {
              messageId: id,
              textChannelId: textChannelId,
              voiceChannelId: author.voiceChannelId,
            },
          };
          return;
        } catch (e) {
          this.emit("error", e);
        }
        break;
      case this.botCommands.end:
        try {
          await this.attemptEndEvent({
            id: author.id,
            username: author.username,
          });
          this.state = {
            name: CommandBroker.CLASS_ID,
            data: undefined,
          };
          return;
        } catch (e) {
          this.emit(e);
        }
        break;
      default:
        // Should be unreachable
        throw new BrokerError(
          `while processing message : command ${trigger} not registered`
        );
    }
  }

  /**
   * Attempt to start a record event, checking if all the necessary conditions
   * are there.
   * @throws BrokerError if the channel isn't a text channel or if user has no voice channel
   * @emits start with the voice chanel id as a parameter
   * @param textChannelId ID of text channel the start command originated from
   * @param messageId     ID of the message the start command origined from
   * @param voiceChannelId Voice channel the user starting the record is in.
   */
  async attemptStartEvent(
    textChannelId: string,
    messageId: string,
    voiceChannelId: string
  ) {
    const message = await this.boImpl.getMessage(textChannelId, messageId);
    this.messageBuffer = message;
    if (message.channel?.type !== ChannelType.GuildText) {
      throw new BrokerError(
        `while starting record : Expected text channel but got ${
          ChannelType.GuildText[message.channel?.type]
        }`
      );
    }
    if (voiceChannelId === undefined || voiceChannelId === null) {
      throw new BrokerError(
        `while starting record : Expected user to be in a voice channel`
      );
    }
    this.emit("start", {
      voiceChannelId: voiceChannelId,
    } as IRecordAttemptInfo);
  }

  /**
   * Attempt to end a recording session
   * @param endAuthor end message author
   * @emits end
   * @throws BrokerError if the user ending the recording session is not the same as the user that started it
   */
  async attemptEndEvent(endAuthor: { id: string; username: string }) {
    if (this.messageBuffer === undefined) {
      throw new BrokerError(
        `Attempting to end a record that hasn't started with this method`
      );
    }
    // Check author
    if (this.messageBuffer.member.id !== endAuthor.id) {
      throw new BrokerError(
        `while finishing record : ${this.messageBuffer.member.username} must end the recording himself (not ${endAuthor.username})`
      );
    }
    this.emit("end");
  }

  async sendMessage(message: string): Promise<number> {
    if (this.messageBuffer === undefined) {
      return Promise.resolve(0);
    }

    await this.messageBuffer.channel.createMessage(message);
    return 1;
  }

  signalState(event: RECORD_EVENT): Promise<void> {
    // This isn't used with this broker
    return Promise.resolve(undefined);
  }

  getState(): Promise<IControllerState> {
    return Promise.resolve(this.state);
  }

  validateState(state: IControllerState): boolean {
    // Check if the state was emitted by this controller
    if (state.name !== CommandBroker.CLASS_ID) return false;
    // If any of the data values are undefined, there is something wrong, abort
    const data = (state as ICommandBrokerState).data;
    if (
      data?.messageId === undefined ||
      data?.voiceChannelId === undefined ||
      data?.textChannelId === undefined
    ) {
      return false;
    }
    return true;
  }

  /**
   * Resume a recording from the given state
   * @param state
   */
  async resumeFromState(state: IControllerState): Promise<boolean> {
    const isOk = this.validateState(state);
    if (!isOk) {
      return false;
    }
    this.state = state as ICommandBrokerState;
    try {
      await this.attemptStartEvent(
        this.state.data.textChannelId,
        this.state.data.messageId,
        // This can be either null or undefined so we're checking strictly
        this.state.data.voiceChannelId ?? undefined
      );
    } catch (e) {
      this.emit("error", e);
      return false;
    }
    return true;
  }

  /**
   * As a controller is identified by its CLASS_ID, we're updating the toString accordingly
   */
  toString(): string {
    return CommandBroker.CLASS_ID;
  }

  /**
   * True if this text is a command text
   * @param msgContent content of in incoming message
   * @return boolean
   * @private
   */
  private isCommand(msgContent: string): boolean {
    return msgContent.startsWith(this.cmdPrefix);
  }

  /**
   * True if the message was sent by the bot itself
   * @param msgAuthorId Id of the user having sent this message
   * @return boolean
   * @private
   */
  private async isAuthorSelf(msgAuthorId: string): Promise<boolean> {
    return msgAuthorId === this.boImpl?.client?.user?.id;
  }
}

/**
 * State of the command broker, containing property to allow it to resume
 */
interface ICommandBrokerState extends IControllerState {
  data: {
    messageId: string;
    textChannelId: string;
    voiceChannelId: string;
  };
}
