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

describe("Pool instances", () => {
  // A proxy that records which keys were touched
  function getSpyingProxy() {
    const reads: string[] = [];
    const writes: string[] = [];
    const proxy: IStoreProxy = {
      get<T>(storeName: string, key: string): Promise<T> {
        reads.push(key);
        return Promise.resolve(undefined as unknown as T);
      },
      save<T>(
        storeName: string,
        keyVal: readonly [{ key: any; value: any }],
      ): Promise<void> {
        writes.push(keyVal[0].key);
        return Promise.resolve(undefined);
      },
    };
    return { proxy, reads, writes };
  }

  it("Use the plain key when running alone", () => {
    const store = new ExternalStore(getSpyingProxy().proxy, "store");
    expect(store.stateKey).toEqual(ExternalStore.STATE_KEY);
  });

  it("Use a key of its own when part of a pool", () => {
    const store = new ExternalStore(
      getSpyingProxy().proxy,
      "store",
      "pandora-1",
    );
    expect(store.stateKey).toEqual(`${ExternalStore.STATE_KEY}-pandora-1`);
  });

  it("Two instances of a pool never share a key", () => {
    // They run against the same state store : sharing a key would mean
    // silently overwriting each other's recording state
    const one = new ExternalStore(getSpyingProxy().proxy, "store", "pandora-0");
    const two = new ExternalStore(getSpyingProxy().proxy, "store", "pandora-1");
    expect(one.stateKey).not.toEqual(two.stateKey);
  });

  it("Read and write under its own key", async () => {
    const { proxy, reads, writes } = getSpyingProxy();
    const store = new ExternalStore(proxy, "store", "pandora-3");
    await store.getState();
    await store.setState(undefined);
    await store.deleteState();

    const own = `${ExternalStore.STATE_KEY}-pandora-3`;
    expect(reads).toEqual([own]);
    expect(writes).toEqual([own, own]);
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
      keyVal: readonly [{ key: any; value: any }],
    ): Promise<void> {
      state = keyVal[0].value;
      return Promise.resolve(undefined);
    },
  };
  return new ExternalStore(mockProxy, "");
}
