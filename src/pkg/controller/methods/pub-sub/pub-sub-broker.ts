import { DaprClient, DaprServer } from "dapr-client";
import {
  IController,
  IControllerState,
  RECORD_EVENT,
} from "../../bot-control.types";
import * as EventEmitter from "events";
import { injectable } from "inversify";

@injectable()
export class PubSubBroker extends EventEmitter implements IController {
  /** Class identifier, used to prevent using reflection on the class name which can be flaky */
  private static readonly CLASS_ID = "PUBSUB";
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
  private readonly server = new DaprServer();
  private readonly client = new DaprClient();

  // PubSubName : Name of the Dapr component to use as a Pub/Sub interface
  constructor(private readonly pubSubName: string) {
    super();
  }

  async start(): Promise<void> {
    await this.server.pubsub.subscribe(
      this.pubSubName,
      PubSubBroker.TOPICS.START,
      (data) => Promise.resolve(this.emit("start", this.handleData(data)))
    );

    await this.server.pubsub.subscribe(
      this.pubSubName,
      PubSubBroker.TOPICS.END,
      (data) => Promise.resolve(this.emit("end", this.handleData(data)))
    );

    await this.server.start();
  }

  handleData(data: any): any {
    return data;
  }

  async getState(): Promise<IControllerState> {
    const state: IControllerState = {
      name: PubSubBroker.CLASS_ID,
      /** We don't need any additional data */
      data: undefined,
    };
    return state;
  }

  async resumeFromState(state: IControllerState): Promise<boolean> {
    if (state.name !== PubSubBroker.CLASS_ID) return false;
    return true;
  }

  async sendMessage(message: string): Promise<number> {
    await this.client.pubsub.publish(
      this.pubSubName,
      PubSubBroker.TOPICS.INFO,
      { data: message }
    );
    return 1;
  }

  async signalState(event: RECORD_EVENT): Promise<void> {
    switch (event) {
      case RECORD_EVENT.STARTED:
        await this.client.pubsub.publish(
          this.pubSubName,
          PubSubBroker.TOPICS.STARTED,
          { data: undefined }
        );
        break;
      case RECORD_EVENT.STOPPED:
        await this.client.pubsub.publish(
          this.pubSubName,
          PubSubBroker.TOPICS.ENDED,
          // TODO : Add data
          { data: undefined }
        );
        break;
      default:
        this.emit("error", new Error(`Unhandled signal received ${event}`));
    }
  }

  toString(): string {
    return PubSubBroker.CLASS_ID;
  }
}
