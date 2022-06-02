/**
 * Underlying implementation of the external storage must have these methods
 */
import { IControllerState } from "../controller/bot-control.types";

export interface IStoreProxy {
  get(storeName: string, key: string): Promise<any>;

  save(storeName: string, [{ key: string, value: any }]): Promise<void>;
}

/**
 * Current bot state
 */
export interface IRecordingState {
  /** Current records IDs */
  recordsIds: string[];
  /** Voice channel ID */
  voiceChannelId: string;
  /** Controller state */
  controllerState: IControllerState;
}

/** A recording store is a storage for the bot recording state.
 * This store must be available in case the bot needs to do a disaster recovery
 * */
export interface IRecordingStore {
  /** Retrieve the current state */
  getState(): Promise<IRecordingState | undefined>;

  /** Set the current state, this erases any other values */
  setState(state: IRecordingState): Promise<void>;

  /** Set the current state to undefined */
  deleteState(): Promise<void>;
}
