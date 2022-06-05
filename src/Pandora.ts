import { inject, injectable } from "inversify";
import { ChannelType } from "discord-api-types/v10";
import { Client, VoiceChannel } from "eris";
import { TYPES } from "./types";
import {
  IController,
  IRecordAttemptInfo,
  IUnifiedBotController,
  RECORD_EVENT,
} from "./pkg/controller/bot-control.types";
import {
  IRecordingState,
  IRecordingStore,
} from "./pkg/state-store/state-store.api";
import { IRecorderService } from "./pkg/audio-recorder/audio-recorder-api";
import { InvalidRecorderStateError } from "./pkg/audio-recorder/audio-recorder";
import { ILogger } from "./pkg/logger/logger-api";
import { exit } from "process";

@injectable()
export class Pandora {
  /** Is the bot allowed to resume a record ? */
  private isResumingRecord = false;
  private client: Client;

  constructor(
    /** Discord client */
    @inject(TYPES.ClientProvider) private clientProvider: () => Promise<Client>,
    /** Unified ways to control the bot either by text command, pub,sub, interactions.. */
    @inject(TYPES.UnifiedController)
    private unifiedController: IUnifiedBotController,
    /** Actual audio recorder */
    @inject(TYPES.AudioRecorder) private audioRecorder: IRecorderService,
    /** State storage to handle disaster recovery */
    @inject(TYPES.StateStore) private stateStore: IRecordingStore,
    /** Logging interface */
    @inject(TYPES.Logger) private logger: ILogger
  ) {}

  async bootUp(): Promise<void> {
    this.client = await this.clientProvider();

    // Starting a new record when any of the control method asks to
    this.unifiedController.on("start", (evt) =>
      this.onStartCommand(evt.controller, evt.data)
    );

    // Starting a new record when any of the control method asks to
    this.unifiedController.on("end", (evt) =>
      this.onEndCommand(evt.controller, evt.data)
    );

    // Logging any controller infos
    this.unifiedController.on("debug", (evt) =>
      this.onControllerDebugEvent(evt.controller, evt.message)
    );

    // Listens to any controller error, notify the user via the controller and logs it
    this.unifiedController.on("error", (evt) =>
      this.onControllerErrorEvent(evt.controller, evt.error)
    );

    // Init control methods
    await this.unifiedController.initialize();

    this.client.on("connect", () => {
      this.logger.info("Up & Ready");
    });

    await this.client.connect();

    // Error restart handling
    if (await this.isResumingFromError()) {
      this.logger.info("Attempting to resume from aborted recording...");
      await this.resumeRecording();
    } else {
      this.logger.info("State is clean, no pending recording.");
    }
  }

  /**
   * Reacts to any controller firing a "start" command
   * @param c Controller firing the command
   * @param data Recording context info
   */
  async onStartCommand(
    c: IController,
    data: IRecordAttemptInfo
  ): Promise<void> {
    this.logger.info(`[Controller ${c}] :: Starting a new recording...`);
    this.logger.debug(`Record parameters : ${JSON.stringify(data)}`);
    await this.startRecording(c, data);
  }

  /**
   * Reacts to any controller firing an "end" command
   * @param c Controller firing the command
   * @param data Recording context info
   */
  async onEndCommand(c: IController, data: any): Promise<void> {
    this.logger.info(`[Controller ${c}] :: Ending recording`);
    await this.endRecording(c, data);
  }

  /**
   * Reacts to any controller firing an "debug" event
   * @param c Controller firing the event
   * @param message debug message
   */
  onControllerDebugEvent(c: IController, message: string): void {
    this.logger.debug(`[Controller ${c}] :: ${message}`);
  }

  /**
   * Reacts to any controller firing an "error" event
   * @param c Controller firing the event
   * @param message error message
   */
  async onControllerErrorEvent(c: IController, error: Error): Promise<void> {
    this.logger.error(`Controller ${c} returned an error`, {
      err: error,
    });
    await c.sendMessage(error.message);
  }

  /**
   * Checks if the bot current state is dirty (not empty)
   * A dirty state right after the bot has booted up means something went
   * wrong with the record process
   */
  async isResumingFromError(): Promise<boolean> {
    const state = await this.stateStore.getState();
    return state !== undefined && state.controllerState !== undefined;
  }

  /**
   * Resume recording from a previously recorded state.
   * A restored controller will immediately fire a start event
   */
  async resumeRecording(): Promise<void> {
    const state = await this.stateStore.getState();
    const canResume = await this.unifiedController.resumeFromState(
      state.controllerState
    );
    if (canResume) {
      this.isResumingRecord = true;
    } else {
      // No controller can go on, reset state, going blank
      await this.stateStore.deleteState();
    }
  }

  async startRecording(
    c: IController,
    data: IRecordAttemptInfo
  ): Promise<void> {
    if (c === undefined) {
      throw new Error("Unexpected error, controller is not defined");
    }
    // retrieve state
    //    -> Check if already recording, if yes abort
    const currentState = await this.stateStore.getState();
    // State is dirty so either ...
    if (currentState !== undefined) {
      // a start event was fired while the bot is already recording...
      if (!this.isResumingRecord) {
        await this.logger.info(
          `A recording attempt was denied : Bot is already recording`
        );
        await c.sendMessage(
          "A recording has already started. Please end the current recording before starting another"
        );
        return;
      }
      // Or this is a disaster recovery scenario
      await c.sendMessage(
        "Recovered from discord stream failure, now recording again ! "
      );
      await this.logger.info("Recovered from recording failure");
    }
    // Past this point, reset the bot to a non recovery state
    this.isResumingRecord = false;

    let channel;
    try {
      channel = this.getVoiceChannelFromId(data.voiceChannelId);
    } catch (e) {
      this.logger.info(`User has no voice channel. Aborting record attempt `);
      await c.sendMessage(
        "You must be in a voice channel to start a new record"
      );
      return;
    }

    try {
      // Start recording the voice channel...
      const recordId = await this.audioRecorder.startRecording(channel);
      // Listening to errors on the audiorecorder side
      this.audioRecorder.on("error", (err) => this.handleRecorderError(c, err));
      this.audioRecorder.on("debug", (message) => {
        this.logger.debug(`[Audiorecorder] =>  ${message}`);
      });
      this.logger.debug(`[Main] :: Record started with id ${recordId}`);
      // commit this new record to the external state...
      await this.persistNewRecord(
        currentState,
        c,
        data.voiceChannelId,
        recordId
      );
      // and inform the controller that the recording started
      await c.signalState(RECORD_EVENT.STARTED);
    } catch (e) {
      switch (e.constructor.name) {
        case InvalidRecorderStateError.name:
          this.logger.error(
            "Invalid audiorecorder state : Bot is already recording. Aborting"
          );
          await c.sendMessage(
            "A recording has already started. Please end the current recording before starting another"
          );
          break;
        default:
          this.logger.error("Unexpected error", e);
          await c.sendMessage("Something unexpected happened, Rebooting");
          await this.stateStore.deleteState();
          exit(-1);
      }
    }

    try {
      // Record has started
      this.client.editStatus("online", {
        name: `${(channel as VoiceChannel).name}`,
        type: 2,
      });
    } catch (e) {
      // We don't care if this fails
    }
  }

  async endRecording(c: IController, data: any): Promise<void> {
    // retrieve state
    //    -> Check if not recording, if yes abort
    if (c === undefined) {
      throw new Error("Unexpected error, controller is not defined");
    }
    const currentState = await this.stateStore.getState();
    if (currentState === undefined) {
      this.logger.info(
        "An attempt to end a non existent recording was made. Aborting"
      );
      await c.sendMessage("No recording ");
      return;
    }
    // end record
    try {
      const startTime = this.audioRecorder.stopRecording();
      // Preventing multiple event handler to be registered across multiple sessions
      this.audioRecorder.removeAllListeners("error");
      this.audioRecorder.removeAllListeners("debug");
      await c.signalState(RECORD_EVENT.STOPPED);
    } catch (e) {
      switch (e.constructor.name) {
        case InvalidRecorderStateError.name:
          this.logger.info(
            "An attempt to end a non existent recording was made. Aborting"
          );
          await c.sendMessage("No pending recording");
          break;
        default:
          this.logger.error("Unexpected error", e);
          await c.sendMessage("Something unexpected happened, Rebooting");
          await this.stateStore.deleteState();
      }
    }

    try {
      this.client.editStatus("online", null);
    } catch (e) {
      // We don't care if this fails
    }
    // Record ended successfully, reset the state
    await this.stateStore.deleteState();
  }

  async handleRecorderError(c: IController, err: Error): Promise<never> {
    this.logger.error("An error happened while recording. Rebooting ", {
      err: err,
    });
    await c.sendMessage(
      "Unexpected Discord stream error encountered. Recovering...  "
    );
    // Crash to reset everything.
    // We can't exactly ensure that the Discord lib has recovered from the error
    // as sometimes it just won't reconnect to the voiceChannel.
    // So we're resetting everything to zero and doing disaster recovery
    exit(-1);
  }

  /**
   * Return a Eris voicechannel from its id
   * @param id
   */
  getVoiceChannelFromId(id: string) {
    // Verify preconditions :
    // -> A voice channel exists and can be recorded
    const channel = this.client.getChannel(id);
    if (channel === undefined || channel.type !== ChannelType.GuildVoice) {
      throw new Error("Invalid channel");
    }
    // TODO: Check if the bot has the correct permissions to join and listen
    // to the voice channel
  }

  /**
   * Store this record into the state to allow for recovery
   * @param currentState
   * @param c
   * @param voiceChannelId
   * @param recordId
   */
  async persistNewRecord(
    currentState: IRecordingState,
    c: IController,
    voiceChannelId: string,
    recordId: string
  ): Promise<void> {
    // store state
    // There can be multiple record IDs if we're resuming a previous record
    const recordingIds = currentState?.recordsIds ?? [];
    recordingIds.push(recordId);
    await this.stateStore.setState({
      recordsIds: recordingIds,
      controllerState: await c.getState(),
      voiceChannelId,
    });
  }
}
