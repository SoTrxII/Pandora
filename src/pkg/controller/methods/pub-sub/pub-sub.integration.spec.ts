/**
 * These are integration testing using Dapr as a storage indirection.
 * Dapr must be running for these to work
 * Run these commands before :
 * dapr init
 * dapr run --dapr-http-port 3500
 * These tests are ignored by jest
 */
import "reflect-metadata";
import { DaprClient, DaprServer } from "@dapr/dapr";
import { PubSubBroker } from "./pub-sub-broker";
import { DaprServerAdapter } from "./dapr-server-adapter";
import { RECORD_EVENT } from "../../bot-control.types";
import IClientPubSub from "@dapr/dapr/interfaces/Client/IClientPubSub";
import IServerPubSub from "@dapr/dapr/interfaces/Server/IServerPubSub";

describe("Pub Sub Broker :: Integration", () => {
  let directClient: IClientPubSub,
    directServer: IServerPubSub,
    broker: PubSubBroker;
  beforeEach(() => {
    directClient = new DaprClient().pubsub;
    directServer = new DaprServer().pubsub;
    broker = new PubSubBroker(
      new DaprClient().pubsub,
      new DaprServerAdapter(),
      "pubsub"
    );
  });
  it("Start the broker", async () => {
    await expect(broker.start()).resolves.not.toThrow();
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
  describe("Send message", () => {
    it("Send a message", async () => {
      await broker.sendMessage("test");
    }, 10000);
  });
});
