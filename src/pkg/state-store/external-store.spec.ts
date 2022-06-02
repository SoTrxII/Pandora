import "reflect-metadata";
import { ExternalStore } from "./external-store";
import { IRecordingState, IStoreProxy } from "./state-store.api";

const mockData: IRecordingState = {
  recordsIds: ["0"],
  voiceChannelId: "1",
  controllerState: undefined,
};

describe("State store", () => {
  describe("GET", () => {
    it("Store empty", async () => {
      const ss = getDynamicExternalStore();
      const state = await ss.getState();
      expect(state).toBeUndefined();
    });
    it("Store non-empty", async () => {
      const ss = getDynamicExternalStore(mockData);
      const state = await ss.getState();
      expect(state).toEqual(mockData);
    });
  });
  describe("SET", () => {
    it("Mutate state", async () => {
      const mockDataFrom = mockData;
      const mockDataTo = mockData;
      const ss = getDynamicExternalStore(mockDataFrom);
      expect(await ss.getState()).toEqual(mockDataFrom);
      await ss.setState(mockDataTo);
      expect(await ss.getState()).toEqual(mockDataTo);
    });
  });
  describe("DELETE", () => {
    it("Return state to undefined on deletion", async () => {
      const ss = getDynamicExternalStore(mockData);
      expect(await ss.getState()).toEqual(mockData);
      await ss.deleteState();
      expect(await ss.getState()).toBeUndefined();
    });
  });
});

/**
 * Mock store with a real internal state
 */
function getDynamicExternalStore(startValue?: IRecordingState) {
  let state = startValue;
  const mockProxy: IStoreProxy = {
    get<T>(storeName: string, key: string): Promise<T> {
      return Promise.resolve(state as unknown as T);
    },
    save<T>(
      storeName: string,
      keyVal: readonly [{ key: any; value: any }]
    ): Promise<void> {
      state = keyVal[0].value;
      return Promise.resolve(undefined);
    },
  };
  return new ExternalStore(mockProxy, "");
}
