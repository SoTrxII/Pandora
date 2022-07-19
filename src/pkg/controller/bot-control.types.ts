export class BrokerError extends Error {}

export enum RECORD_EVENT {
  /** Record has started successfully */
  STARTED,
  /** Record stopped successfully */
  STOPPED,
}

/**
 * A controller state is a collection of properties
 * allowing a controller to resume recording after a system crash
 */
export interface IControllerState {
  /** Controller name */
  name: string;
  data: Record<string, any>;
}

/**
 * Every info needed to start a new discord recording sessions
 */
export interface IRecordAttemptInfo {
  /** ID of the Voice channel to record */
  voiceChannelId: string;
}

/**
 * A Controller represents a way a record session can be started/ended.
 */
export declare interface IController {
  /**
   * Signaling that a record must be started
   * @param event
   * @param listener
   */
  on(event: "start", listener: (infos: IRecordAttemptInfo) => void): this;

  /**
   * Signalling that a record must be ended
   * @param event
   * @param listener
   */
  on(event: "end", listener: (channelId: string) => void): this;

  /**
   * Controller errors channel
   * @param event
   * @param listener
   */
  on(event: "error", listener: (error: Error) => void): this;

  /**
   * Controller info channel
   * @param event
   * @param listener
   */
  on(event: "debug", listener: (message: string) => void): this;

  /**
   * Makes the control interface listen to their events
   */
  start(): Promise<void>;

  /**
   * Get the controller current state
   */
  getState(): Promise<IControllerState>;

  /**
   * Resume recording using a state
   * @returns True if the state was resumed. False if invalid state
   */
  resumeFromState(state: IControllerState): Promise<boolean>;

  /**
   * Pass info to the controller
   * @returns number of messages sent
   */
  sendMessage(message: string): Promise<number>;

  /**
   * Signals an evolution on the recording process state
   * @param event
   */
  signalState(
    event: RECORD_EVENT.STARTED,
    payload?: Record<string, unknown>
  ): Promise<void>;
  signalState(
    event: RECORD_EVENT.STOPPED,
    payload?: { ids: string[] }
  ): Promise<void>;
}

/**
 * The unified bot controller
 */
export declare interface IUnifiedBotController {
  /**
   * Signaling that a record must be started
   * @param event
   * @param listener
   */
  on(
    event: "start",
    listener: ({ data: IRecordAttemptInfo, controller: IController }) => void
  ): this;

  /**
   * Signalling that a record must be ended
   * @param event
   * @param listener
   */
  on(
    event: "end",
    listener: ({ data: any, controller: IController }) => void
  ): this;

  /**
   * Passing controller errors along
   * @param event
   * @param listener
   */
  on(
    event: "error",
    listener: ({ error: Error, controller: IController }) => void
  ): this;

  /**
   * Passing controller debug infos along
   * @param event
   * @param listener
   */
  on(
    event: "debug",
    listener: ({ message: string, controller: IController }) => void
  ): this;

  /**
   * Boot al all associated Controller interfaces
   */
  initialize(): Promise<void>;

  /**
   * Propagate a state to every controller to have at least one of them resume
   * @param state
   * @return True if at least one controller resumed
   */
  resumeFromState(state: IControllerState): Promise<boolean>;
}
