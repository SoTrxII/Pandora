import {
  IController,
  IControllerState,
  IRecordAttemptInfo,
  RECORD_EVENT,
} from "../../bot-control.types";
import * as EventEmitter from "events";
import { inject, injectable } from "inversify";
import { TYPES } from "../../../../types";
import { IPubSubClientProxy, IPubSubServerProxy } from "./pub-sub-broker-api";

@injectable()
export class PubSubBroker extends EventEmitter implements IController {
  /** Class identifier, used to prevent using reflection on the class name which can be flaky */
  private static readonly CLASS_ID = "PUBSUB";

  /** Currently recorded voice channel */
  private recVoiceChannelId: string = undefined;
  /** Correlation ids of the requests we still owe a reply to.
   * Start and stop are tracked apart : they are two distinct requests, and a
   * session is usually stopped long after it was started */
  private startCorrelationId: string = undefined;
  private endCorrelationId: string = undefined;
  /** All the topics used by this broker
   * We're going to use the Reply/Response pattern
   * */
  private static readonly TOPICS = {
    START: "startRecordingDiscord",
    STARTED: "startedRecordingDiscord",
    END: "stopRecordingDiscord",
    ENDED: "stoppedRecordingDiscord",
    INFO: "recordingDiscordInfo",
  };

  constructor(
    @inject(TYPES.PubSubClientProxy)
    private readonly client: IPubSubClientProxy,
    @inject(TYPES.PubSubServerProxy)
    private readonly server: IPubSubServerProxy,
    private readonly pubSubName: string,
  ) {
    super();
  }

  async start(): Promise<void> {
    await this.server.subscribe(
      this.pubSubName,
      PubSubBroker.TOPICS.START,
      (data) => this.attemptStartEvent(data),
    );

    await this.server.subscribe(
      this.pubSubName,
      PubSubBroker.TOPICS.END,
      (data) => this.attemptEndEvent(data),
    );

    await this.server.start();
    this.emit("debug", "Registrations complete");
  }

  /**
   * Fires a start event if all the conditions are met
   * @param data event payload
   */
  async attemptStartEvent(data: IRecordAttemptInfo): Promise<void> {
    this.emit("debug", `Message received ${data}`);
    if (this.isStartPayloadValid(data ?? undefined)) {
      this.emit("start", {
        voiceChannelId: data.voiceChannelId,
        correlationId: data.correlationId,
      } as IRecordAttemptInfo);
      this.recVoiceChannelId = data.voiceChannelId;
      this.startCorrelationId = data.correlationId;
    } else {
      this.emit(
        "error",
        new Error(
          `Couldn't start recording, invalid start payload ${JSON.stringify(
            data,
          )}`,
        ),
      );
    }
  }

  /**
   * Fires an end event of all the conditions are met
   * @param data
   */
  async attemptEndEvent(data: IRecordAttemptInfo): Promise<void> {
    if (this.isEndPayloadValid(data)) {
      this.endCorrelationId = data?.correlationId;
      this.emit("end");
    } else
      this.emit(
        "debug",
        `Received end event, but conditions not met to end recording : recVoiceChannelID: ${
          this.recVoiceChannelId
        }, payload : ${JSON.stringify(data)}`,
      );
  }

  /**
   * Checks if the end event attempt is valid
   * @param data
   */
  isEndPayloadValid(data: IRecordAttemptInfo): boolean {
    // Two situations here

    // 1 -> The payload doesn't specify any voice channel
    // This means stop all
    if (data === undefined || data.voiceChannelId === undefined) return true;

    // 2 -> The payload contains a specific voice channel
    // If it's the one Pandora is recording, stop
    // otherwise, ignore
    if (
      this.recVoiceChannelId !== undefined &&
      data?.voiceChannelId === this.recVoiceChannelId
    )
      return true;

    return false;
  }

  /**
   * Attempt to fires a start command if every condition are met
   * @param data
   */
  isStartPayloadValid(data: IRecordAttemptInfo): boolean {
    return (
      data?.voiceChannelId !== undefined && !isNaN(Number(data?.voiceChannelId))
    );
  }

  async getState(): Promise<IControllerState> {
    const state: IControllerState = {
      name: PubSubBroker.CLASS_ID,
      /** We don't need any additional data */
      data: {
        recVoiceChannelId: this.recVoiceChannelId,
        startCorrelationId: this.startCorrelationId,
      },
    };
    return state;
  }

  async resumeFromState(state: IControllerState): Promise<boolean> {
    if (state.name !== PubSubBroker.CLASS_ID) return false;
    if (state?.data?.recVoiceChannelId === undefined) return false;
    this.recVoiceChannelId = state?.data?.recVoiceChannelId;
    // Replayed as-is rather than dropped : whoever asked for this recording
    // has long stopped waiting, and an id they no longer know about is
    // discarded on their side. A blank one could be mistaken for a live request
    this.startCorrelationId = state?.data?.startCorrelationId;
    try {
      await this.attemptStartEvent({
        voiceChannelId: this.recVoiceChannelId,
        correlationId: this.startCorrelationId,
      });
    } catch (e) {
      this.emit("error", e);
      return false;
    }
    return true;
  }

  async sendMessage(message: string): Promise<number> {
    await this.client.publish(this.pubSubName, PubSubBroker.TOPICS.INFO, {
      data: message,
    });
    return 1;
  }

  async signalState(
    event: RECORD_EVENT,
    payload: Record<string, unknown>,
  ): Promise<void> {
    // There is a weird ts bug on enum when used in switches
    // the '+' is converting the enum back to a number
    switch (+event) {
      case RECORD_EVENT.STARTED:
        await this.client.publish(
          this.pubSubName,
          PubSubBroker.TOPICS.STARTED,
          {
            ...payload,
            correlationId: this.startCorrelationId,
          },
        );
        break;
      case RECORD_EVENT.STOPPED:
        await this.client.publish(this.pubSubName, PubSubBroker.TOPICS.ENDED, {
          ...payload,
          correlationId: this.endCorrelationId,
        });
        break;
      default:
        this.emit("error", new Error(`Unhandled signal received ${event}`));
    }
  }

  toString(): string {
    return PubSubBroker.CLASS_ID;
  }
}
