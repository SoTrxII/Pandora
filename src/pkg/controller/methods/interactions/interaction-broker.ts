import {
  BrokerError,
  IController,
  IControllerState,
  IRecordAttemptInfo,
  RECORD_EVENT,
} from "../../bot-control.types";
import * as EventEmitter from "events";
import { injectable } from "inversify";
import {
  ApplicationCommand,
  ApplicationCommandCreateOptions,
  Client,
  CommandInteraction,
  Constants,
  Interaction,
  Message,
  TextableChannel,
} from "eris";
import { ChannelType } from "discord-api-types/v10";

@injectable()
export class InteractionBroker extends EventEmitter implements IController {
  /** Eris Client */
  private boImpl: Client;

  /** This controller state*/
  private state: IInteractionBrokerState;

  /** Class identifier, used to prevent using reflection on the class name which can be flaky */
  private static readonly CLASS_ID = "INTERACTIONS";

  /** Last message from the last interaction having triggered a command */
  private messageBuffer: Message<TextableChannel>;

  /** Last interaction having triggered a command */
  private interactionBuffer: CommandInteraction;

  /** Commands to register against discord's api gateway */
  private readonly commands: ApplicationCommandCreateOptions<boolean>[];

  /** Default commands to register */
  private static readonly DEFAULT_COMMANDS: ApplicationCommandCreateOptions<boolean>[] =
    [
      {
        name: "record",
        description: "Record the voice channel the user is in",
        type: Constants.ApplicationCommandTypes.CHAT_INPUT,
      },
      {
        name: "end",
        description: "End a previously started recording",
        type: Constants.ApplicationCommandTypes.CHAT_INPUT,
      },
    ];

  constructor(
    private readonly clientProvider: () => Promise<Client>,
    commands: ApplicationCommandCreateOptions<boolean>[] = []
  ) {
    super();
    this.commands = commands ?? InteractionBroker.DEFAULT_COMMANDS;
  }

  /**
   * Register all commands against discord gateway api
   * @param commands
   */
  async registerCommands(
    commands: ApplicationCommandCreateOptions<boolean>[]
  ): Promise<void> {
    try {
      await Promise.all(
        commands.map(async (c) => await this.boImpl.createCommand(c))
      );
      this.emit("debug", "Slash commands registration complete");
    } catch (e) {
      this.emit("error", "Couldn't register commands");
    }
  }

  async attemptStartEvent(
    textChannelId: string,
    messageId: string,
    voiceChannelId: string
  ): Promise<void> {
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

  async attemptEndEvent(endAuthor: { id: string; username: string }) {
    if (this.messageBuffer === undefined) {
      throw new BrokerError(
        `Attempting to end a record that hasn't started with this method`
      );
    }
    // Check author
    if (this.state?.data?.authorId !== endAuthor.id) {
      throw new BrokerError(
        `while finishing record : ${this.state?.data?.authorId} must end the recording himself (not ${endAuthor.username})`
      );
    }
    this.emit("end");
  }

  async start(): Promise<void> {
    this.boImpl = await this.clientProvider();
    await this.registerCommands(this.commands);

    // Get rid as soon as possible of the Eris Message
    this.boImpl.on("interactionCreate", async (i) => {
      if (i instanceof CommandInteraction) await this.handleInteraction(i);
    });
  }

  async handleInteraction(interaction: CommandInteraction) {
    switch (interaction.data.name) {
      case "record":
        try {
          await interaction.acknowledge();
          // Buffering the interaction to be able to reply to it
          this.interactionBuffer = interaction;
          const origMessage = await interaction.getOriginalMessage();
          await this.attemptStartEvent(
            interaction.channel.id,
            origMessage.id,
            interaction?.member?.voiceState?.channelID
          );
          this.state = {
            name: InteractionBroker.CLASS_ID,
            data: {
              messageId: origMessage.id,
              textChannelId: interaction.channel.id,
              voiceChannelId: interaction?.member?.voiceState?.channelID,
              authorId: interaction?.member?.id,
            },
          };
          return;
        } catch (e) {
          this.emit("error", e);
        }
        break;
      case "end":
        try {
          await interaction.acknowledge();
          // Buffering the interaction to be able to reply to it
          this.interactionBuffer = interaction;
          await this.attemptEndEvent({
            id: interaction?.member.id,
            username: interaction?.member?.username,
          });
          this.state = {
            name: InteractionBroker.CLASS_ID,
            data: undefined,
          };
        } catch (e) {
          this.emit("error", e);
        }
        break;
      default:
        this.emit(
          "debug",
          `Interaction received ${interaction.data.name}, but no handler found`
        );
    }
  }

  getState(): Promise<IControllerState> {
    return Promise.resolve(this.state);
  }

  validateState(state: IControllerState): boolean {
    // Check if the state was emitted by this controller
    if (state.name !== InteractionBroker.CLASS_ID) return false;
    // If any of the data values are undefined, there is something wrong, abort
    const data = (state as IInteractionBrokerState).data;
    if (
      data?.messageId === undefined ||
      data?.voiceChannelId === undefined ||
      data?.textChannelId === undefined ||
      data?.authorId === undefined
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
    this.state = state as IInteractionBrokerState;
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

  async sendMessage(message: string): Promise<number> {
    if (this.messageBuffer === undefined) {
      return 0;
    }
    // This is a bit more complicated than other brokers
    // Although easier to work with, interactions cannot be recovered after a crash
    // like messages does. To circumvent this problem, we first try to reply
    // to the interaction buffered from the start method. If it doesn't exists,
    // we fallback to answering to the underlying message.
    // Only using the underlying message will let the interaction unanswered
    // which make it look like the bot crashed

    if (this.interactionBuffer !== undefined) {
      await this.interactionBuffer.editOriginalMessage(message);
    } else {
      await this.messageBuffer.channel.createMessage(message);
    }
    return 1;
  }

  toString(): string {
    return InteractionBroker.CLASS_ID;
  }

  /** Not needed for this controller, this is a direct to user */
  signalState(event: RECORD_EVENT): Promise<void> {
    return Promise.resolve(undefined);
  }
}

/**
 * State of the interaction broker, containing property to allow it to resume
 */
interface IInteractionBrokerState extends IControllerState {
  data: {
    messageId: string;
    textChannelId: string;
    voiceChannelId: string;
    /** Member triggering the interaction
     * For this broker we can't get it from the message, as the underlying
     * message of an interaction is written by the bot itself
     * */
    authorId: string;
  };
}
