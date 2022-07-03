import "reflect-metadata";
import { PubSubBroker } from "./pub-sub-broker";
import { IPubSubClientProxy, IPubSubServerProxy } from "./pub-sub-broker-api";
import { Substitute } from "@fluffy-spoon/substitute";
import {
  IController,
  IControllerState,
  IRecordAttemptInfo,
  RECORD_EVENT,
} from "../../bot-control.types";

describe("PubSub broker", () => {
  let broker: PubSubBroker;
  const badStartPayloads = [
    undefined,
    { voiceChannelId: undefined } as IRecordAttemptInfo,
    { voiceChannelId: "é" } as IRecordAttemptInfo,
  ];
  const goodStartPayloads = [
    { voiceChannelId: "2222222" } as IRecordAttemptInfo,
    { voiceChannelId: 2222222 } as any,
  ];
  beforeEach(() => {
    broker = getMockedPSBroker();
  });
  it("Start the broker", async () => {
    await expect(broker.start()).resolves.not.toThrow();
  });
  describe("Check the start payload", () => {
    it.each(badStartPayloads)("Invalid %s", (payload) => {
      expect(broker.isStartPayloadValid(payload)).toEqual(false);
    });
    it.each(goodStartPayloads)("Valid %s", (payload) => {
      expect(broker.isStartPayloadValid(payload)).toEqual(true);
    });
  });
  describe("Signal record state", () => {
    const evtList = Object.keys(RECORD_EVENT).map((k) => RECORD_EVENT[k]);
    it.each([RECORD_EVENT.STARTED, RECORD_EVENT.STOPPED])(
      "Valid event %s received",
      async (evt) => {
        await expect(broker.signalState(evt, undefined)).resolves.not.toThrow();
      }
    );
    it("Invalid event received", async () => {
      await expect(
        broker.signalState("test" as any, undefined)
      ).rejects.toThrow();
    });
  });
  describe("Own state", () => {
    it("Give a valid state", async () => {
      const state = await broker.getState();
      expect(state.name).toEqual(broker.toString());
      expect(state.data).toBeUndefined();
    });
    describe("Resuming from state", () => {
      const invalidStates: IControllerState[] = [
        {
          name: "invalid",
          data: undefined,
        },
        {
          name: undefined,
          data: undefined,
        },
      ];
      const cb = getMockedPSBroker();
      const validStates: IControllerState[] = [
        {
          name: cb.toString(),
          data: undefined,
        },
      ];
      it.each(invalidStates)("Reject invalid state %s", async (state) => {
        await expect(broker.resumeFromState(state)).resolves.toEqual(false);
      });
      it.each(validStates)("Accept valid state %s", async (state) => {
        await expect(broker.resumeFromState(state)).resolves.toEqual(true);
      });
    });
    it("Resume from state", async () => {
      const state = await broker.getState();
      expect(state.name).toEqual(broker.toString());
      expect(state.data).toBeUndefined();
    });
  });
  describe("Send message", () => {
    it("Send a message", async () => {
      // Nothing to really test in unit testing
      await broker.sendMessage("test");
    });
  });
  describe("Attempt a start event", () => {
    it.each(goodStartPayloads)(
      "Fire a start event if all the conditions are met",
      async (payload) => {
        const startFired = waitEvent<IRecordAttemptInfo>(broker, "start");
        await expect(broker.attemptStartEvent(payload)).resolves.not.toThrow();
        await expect(startFired).resolves.not.toThrow();
        expect(await startFired).toEqual(payload);
      }
    );
    it.each(badStartPayloads)(
      "Fire a error event if something is wrong",
      async (payload) => {
        const errorFired = waitEvent<Error>(broker, "error");
        await expect(broker.attemptStartEvent(payload)).resolves.not.toThrow();
        await expect(errorFired).resolves;
        expect((await errorFired)?.message).toContain("invalid start payload");
      }
    );
  });

  describe("Attempt a end event", () => {
    it("Fire a end event if all the conditions are met", async () => {
      const endFired = waitEvent<IRecordAttemptInfo>(broker, "end");
      await expect(broker.attemptEndEvent(undefined)).resolves.not.toThrow();
      await expect(endFired).resolves.not.toThrow();
      expect(await endFired).toEqual(undefined);
    });
  });

  describe("Trivia", () => {
    it("toString", async () => {
      const name = broker.toString();
      expect(name.toLowerCase()).not.toEqual("[object object]");
    });
  });
});

function getMockedPSBroker() {
  return new PubSubBroker(
    Substitute.for<IPubSubClientProxy>(),
    Substitute.for<IPubSubServerProxy>(),
    "test"
  );
}

/**
 * Wait for a specific event to be fired by a controller
 * @param cb
 * @param evt
 * @param opt
 */
async function waitEvent<T>(
  cb: IController,
  evt: "start" | "end" | "error",
  opt = { timeout: 3000 }
): Promise<T> {
  return new Promise<T>((res, rej) => {
    setTimeout(rej, opt.timeout);
    cb.on(evt as any, (payload) => res(payload as unknown as T));
  });
}
