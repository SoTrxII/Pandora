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
      },
    );
    it("Invalid event received", async () => {
      await expect(
        broker.signalState("test" as any, undefined),
      ).rejects.toThrow();
    });
  });
  describe("Own state", () => {
    it("Give a valid state at rest", async () => {
      const state = await broker.getState();
      expect(state.name).toEqual(broker.toString());
      expect(state.data).toEqual({
        recVoiceChannelId: undefined,
      });
    });
    it("Give a valid state while recording", async () => {
      await expect(
        broker.attemptStartEvent(goodStartPayloads[0]),
      ).resolves.not.toThrow();
      const state = await broker.getState();
      expect(state.name).toEqual(broker.toString());
      expect(state.data).not.toBeUndefined();
      expect(state.data.recVoiceChannelId).toEqual(
        goodStartPayloads[0].voiceChannelId,
      );
    });
    describe("Resuming from state", () => {
      const cb = getMockedPSBroker();
      const invalidStates: IControllerState[] = [
        {
          name: "invalid",
          data: undefined,
        },
        {
          name: undefined,
          data: undefined,
        },
        {
          name: cb.toString(),
          data: undefined,
        },
      ];

      const validStates: IControllerState[] = [
        {
          name: cb.toString(),
          data: {
            recVoiceChannelId: "222222",
          },
        },
      ];
      it.each(invalidStates)("Reject invalid state %s", async (state) => {
        await expect(broker.resumeFromState(state)).resolves.toEqual(false);
      });
      it.each(validStates)("Accept valid state %s", async (state) => {
        await expect(broker.resumeFromState(state)).resolves.toEqual(true);
      });
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
      },
    );
    it.each(badStartPayloads)(
      "Fire a error event if something is wrong",
      async (payload) => {
        const errorFired = waitEvent<Error>(broker, "error");
        await expect(broker.attemptStartEvent(payload)).resolves.not.toThrow();
        await expect(errorFired).resolves;
        expect((await errorFired)?.message).toContain("invalid start payload");
      },
    );
  });

  describe("Attempt a end event", () => {
    it("Ok when there is no voice channel id is passed along", async () => {
      const endFired = waitEvent<IRecordAttemptInfo>(broker, "end");
      await expect(broker.attemptEndEvent(undefined)).resolves.not.toThrow();
      await expect(endFired).resolves.not.toThrow();
      expect(await endFired).toEqual(undefined);
    });
    it("Ok when a specific voice channel id is passed along", async () => {
      const endFired = waitEvent<IRecordAttemptInfo>(broker, "end");
      await expect(
        broker.attemptStartEvent(goodStartPayloads[0]),
      ).resolves.not.toThrow();

      await expect(
        broker.attemptEndEvent(goodStartPayloads[0]),
      ).resolves.not.toThrow();
      await expect(endFired).resolves.not.toThrow();
      expect(await endFired).toEqual(undefined);
    });

    it("Ok when a specific voice channel id is passed along, but no the one currently recorded", async () => {
      const debugFired = waitEvent<IRecordAttemptInfo>(broker, "debug");
      await expect(
        broker.attemptStartEvent(goodStartPayloads[0]),
      ).resolves.not.toThrow();

      const modPayload = Object.assign(goodStartPayloads[0], {
        voiceChannelId: "45566",
      });
      await expect(broker.attemptEndEvent(modPayload)).resolves.not.toThrow();
      // A debug message should be fired here, to inform of the aborted end attempt
      await expect(debugFired).resolves.not.toThrow();
    });
  });

  describe("Correlation ids", () => {
    // Topic names are spelled out on purpose : they are the contract with the
    // record orchestrator, which routes replies by correlation id
    const STARTED_TOPIC = "startedRecordingDiscord";
    const ENDED_TOPIC = "stoppedRecordingDiscord";

    it("Echo the start correlation id on the started reply", async () => {
      const { broker, published } = getSpyingPSBroker();
      await broker.attemptStartEvent({
        voiceChannelId: "2222222",
        correlationId: "start-1",
      });
      await broker.signalState(RECORD_EVENT.STARTED, {
        voiceChannelId: "2222222",
      });

      const reply = published.find((p) => p.topic === STARTED_TOPIC);
      expect(reply).toBeDefined();
      expect(reply.payload.correlationId).toEqual("start-1");
      expect(reply.payload.voiceChannelId).toEqual("2222222");
    });

    it("Echo the stop correlation id, not the start one, on the stopped reply", async () => {
      const { broker, published } = getSpyingPSBroker();
      await broker.attemptStartEvent({
        voiceChannelId: "2222222",
        correlationId: "start-1",
      });
      await broker.attemptEndEvent({
        voiceChannelId: "2222222",
        correlationId: "stop-1",
      });
      await broker.signalState(RECORD_EVENT.STOPPED, { ids: ["rec-1"] });

      const reply = published.find((p) => p.topic === ENDED_TOPIC);
      expect(reply).toBeDefined();
      expect(reply.payload.correlationId).toEqual("stop-1");
      expect(reply.payload.ids).toEqual(["rec-1"]);
    });

    it("Pass the correlation id along with the start event", async () => {
      const { broker } = getSpyingPSBroker();
      const startFired = waitEvent<IRecordAttemptInfo>(broker, "start");
      await broker.attemptStartEvent({
        voiceChannelId: "2222222",
        correlationId: "start-1",
      });
      expect((await startFired).correlationId).toEqual("start-1");
    });

    it("Keep the correlation id across a disaster recovery restart", async () => {
      const { broker } = getSpyingPSBroker();
      await broker.attemptStartEvent({
        voiceChannelId: "2222222",
        correlationId: "start-1",
      });
      const state = await broker.getState();
      expect(state.data.startCorrelationId).toEqual("start-1");

      // A brand new broker, as if the process had been restarted
      const revived = getSpyingPSBroker();
      await expect(revived.broker.resumeFromState(state)).resolves.toEqual(
        true,
      );
      await revived.broker.signalState(RECORD_EVENT.STARTED, {
        voiceChannelId: "2222222",
      });

      const reply = revived.published.find((p) => p.topic === STARTED_TOPIC);
      expect(reply).toBeDefined();
      expect(reply.payload.correlationId).toEqual("start-1");
    });
  });

  describe("Pool instances", () => {
    it("Listen on the shared topics when running alone", () => {
      const { broker } = getSpyingPSBroker();
      expect(broker.requestTopic("startRecordingDiscord")).toEqual(
        "startRecordingDiscord",
      );
      expect(broker.requestTopic("stopRecordingDiscord")).toEqual(
        "stopRecordingDiscord",
      );
    });

    it("Listen on its own topics when part of a pool", () => {
      const { broker } = getSpyingPSBroker("pandora-1");
      expect(broker.requestTopic("startRecordingDiscord")).toEqual(
        "startRecordingDiscord-pandora-1",
      );
      expect(broker.requestTopic("stopRecordingDiscord")).toEqual(
        "stopRecordingDiscord-pandora-1",
      );
    });

    it("Two instances of a pool never share a request topic", () => {
      const one = getSpyingPSBroker("pandora-0").broker;
      const two = getSpyingPSBroker("pandora-1").broker;
      expect(one.requestTopic("startRecordingDiscord")).not.toEqual(
        two.requestTopic("startRecordingDiscord"),
      );
    });

    it("Subscribe to its own topics, not the shared ones", async () => {
      const subscribed: string[] = [];
      const server: IPubSubServerProxy = {
        subscribe: async (_pubSubName, topic) => {
          subscribed.push(topic);
        },
        start: async () => undefined,
      };
      const broker = new PubSubBroker(
        Substitute.for<IPubSubClientProxy>(),
        server,
        "test",
        "pandora-2",
      );
      await broker.start();

      expect(subscribed).toEqual([
        "startRecordingDiscord-pandora-2",
        "stopRecordingDiscord-pandora-2",
      ]);
    });

    it("Still replies on the shared topics, so the orchestrator hears it", async () => {
      const { broker, published } = getSpyingPSBroker("pandora-2");
      await broker.attemptStartEvent({
        voiceChannelId: "2222222",
        correlationId: "start-1",
      });
      await broker.signalState(RECORD_EVENT.STARTED, {
        voiceChannelId: "2222222",
      });
      expect(published.map((p) => p.topic)).toEqual([
        "startedRecordingDiscord",
      ]);
    });
  });

  describe("Trivia", () => {
    it("toString", async () => {
      const name = broker.toString();
      expect(name.toLowerCase()).not.toEqual("[object object]");
    });
  });
});

/**
 * A broker whose published messages are recorded, to inspect the replies it
 * sends back to the record orchestrator
 */
function getSpyingPSBroker(instanceId?: string) {
  const published: { topic: string; payload: any }[] = [];
  const client: IPubSubClientProxy = {
    publish: async (
      pubSubName: string,
      topic: string,
      payload?: Record<string, unknown>,
    ) => {
      published.push({ topic, payload });
      return true;
    },
  };
  return {
    broker: new PubSubBroker(
      client,
      Substitute.for<IPubSubServerProxy>(),
      "test",
      instanceId,
    ),
    published,
  };
}

function getMockedPSBroker() {
  return new PubSubBroker(
    Substitute.for<IPubSubClientProxy>(),
    Substitute.for<IPubSubServerProxy>(),
    "test",
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
  evt: "start" | "end" | "error" | "debug",
  opt = { timeout: 3000 },
): Promise<T> {
  return new Promise<T>((res, rej) => {
    setTimeout(rej, opt.timeout);
    cb.on(evt as any, (payload) => res(payload as unknown as T));
  });
}
