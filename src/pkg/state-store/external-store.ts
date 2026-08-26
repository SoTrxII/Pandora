import { inject, injectable } from "inversify";
import {
  IRecordingState,
  IRecordingStore,
  IStoreProxy,
} from "./state-store.api";
import { TYPES } from "../../types";

@injectable()
export class ExternalStore<T extends IStoreProxy> implements IRecordingStore {
  public static readonly STATE_KEY = "RECORDING_BOT_STATE";

  /** The key this instance reads and writes.
   * A pool of Pandora instances shares a single state store, so each one must
   * own a distinct key or they would silently overwrite each other's recording
   * state. Without an instance id the plain key is used, as it always was */
  public readonly stateKey: string;

  /** storeProxy is the objet used to get to the store */
  constructor(
    @inject(TYPES.StoreProxy) private readonly storeProxy: T,
    private readonly storeName: string,
    instanceId?: string,
  ) {
    this.stateKey = instanceId
      ? `${ExternalStore.STATE_KEY}-${instanceId}`
      : ExternalStore.STATE_KEY;
  }

  /**
   * Retrieve the current state
   * @returns current state or undefined if no previous state has been defined
   */
  async getState(): Promise<IRecordingState | undefined> {
    const state = await this.storeProxy.get(this.storeName, this.stateKey);
    // The state could be either an empty string or an object
    if (state === undefined || state === null || state.length === 0)
      return undefined;

    return state as IRecordingState;
  }

  /**
   * Set the bot state
   * @param state
   */
  async setState(state: IRecordingState) {
    await this.storeProxy.save(this.storeName, [
      {
        key: this.stateKey,
        value: state,
      },
    ]);
  }

  async deleteState(): Promise<void> {
    await this.storeProxy.save(this.storeName, [
      {
        key: this.stateKey,
        value: undefined,
      },
    ]);
  }
}
