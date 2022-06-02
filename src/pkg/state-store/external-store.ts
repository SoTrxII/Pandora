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

  /** storeProxy is the objet used to get to the store */
  constructor(
    @inject(TYPES.StoreProxy) private readonly storeProxy: T,
    private readonly storeName: string
  ) {}

  /**
   * Retrieve the current state
   * @returns current state or undefined if no previous state has been defined
   */
  async getState(): Promise<IRecordingState | undefined> {
    const state = await this.storeProxy.get(
      this.storeName,
      ExternalStore.STATE_KEY
    );
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
        key: ExternalStore.STATE_KEY,
        value: state,
      },
    ]);
  }

  async deleteState(): Promise<void> {
    await this.storeProxy.save(this.storeName, [
      {
        key: ExternalStore.STATE_KEY,
        value: undefined,
      },
    ]);
  }
}
