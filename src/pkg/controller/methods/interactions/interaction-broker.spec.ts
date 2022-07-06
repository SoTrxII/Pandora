import "reflect-metadata";
import { InteractionBroker } from "./interaction-broker";
import { Arg, Substitute } from "@fluffy-spoon/substitute";
import { Client, CommandInteraction, GuildChannel, Message } from "eris";
import {
  BrokerError,
  IController,
  IRecordAttemptInfo,
  RECORD_EVENT,
} from "../../bot-control.types";
import { ChannelType } from "discord-api-types/v10";

describe("Interactions broker", () => {
  describe("Process commands", () => {
    let ib: InteractionBroker;
    beforeAll(async () => {
      ib = await getInteractionBroker();
    });
    it("Known command start : OK", async () => {
      const startInteraction = Substitute.for<CommandInteraction>();
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      startInteraction.data.returns({ name: "record" });
      await ib.start();
      await expect(
        ib.handleInteraction(startInteraction)
      ).resolves.not.toThrow();
    });
    it("Known command end : OK", async () => {
      const endInteraction = Substitute.for<CommandInteraction>();
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      endInteraction.data.returns({ name: "end" });
      await ib.start();
      // In this case, this should trigger an error because there is no started record
      await expect(ib.handleInteraction(endInteraction)).rejects.toThrow();
    });
    it("Unknown command : KO", async () => {
      const unknownInteraction = Substitute.for<CommandInteraction>();
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      unknownInteraction.data.returns({ name: "unknown" });
      await expect(
        ib.handleInteraction(unknownInteraction)
      ).resolves.not.toThrow();
    });
  });
  describe("End a recording session", () => {
    let ib: InteractionBroker;
    beforeEach(() => {
      ib = getInteractionBroker();
      ib.start();
    });
    it("Error when the user attempting to end the record session isn't the one having started the recording ", async () => {
      const startEventFired = waitEvent<IRecordAttemptInfo>(ib, "start");

      await ib.attemptStartEvent("2", "2", "2");
      await expect(startEventFired).resolves.not.toThrow();
      await expect(
        ib.attemptEndEvent({ id: "2", username: "test" })
      ).rejects.toThrowError(BrokerError);
    });

    it("Error when attempting to end a non-existant recording", async () => {
      const rej = await expect(
        ib.attemptEndEvent({ id: "2", username: "test" })
      ).rejects;
      // Check error type
      await rej.toThrowError(BrokerError);
      // and message
      await rej.toThrow("end a record");
    });
  });
  describe("Validate state", () => {
    let cb;
    beforeAll(async () => {
      cb = await getInteractionBroker();
    });
    it("Not a state for this controller", () => {
      expect(
        cb.validateState({
          name: "inexistant",
          data: undefined,
        })
      ).toEqual(false);
    });
    it("A state for this controller, but with no data", () => {
      expect(
        cb.validateState({
          name: "INTERACTIONS",
          data: undefined,
        })
      ).toEqual(false);
    });
    it("A state for this controller, but with partial data", () => {
      expect(
        cb.validateState({
          name: "INTERACTIONS",
          data: {
            textChannelId: 1,
          },
        })
      ).toEqual(false);
    });

    it("A valid state for this controller", () => {
      expect(
        cb.validateState({
          name: "INTERACTIONS",
          data: {
            textChannelId: "1",
            voiceChannelId: "1",
            messageId: "1",
            authorId: "1",
          },
        })
      ).toEqual(true);
    });
  });
  describe("Send signal", () => {
    it("Should have no effect", async () => {
      const cb = await getInteractionBroker();
      await expect(
        cb.signalState(RECORD_EVENT.STARTED)
      ).resolves.toBeUndefined();
    });
  });
  describe("Trivia", () => {
    it("toString", () => {
      const cb = getInteractionBroker();
      const name = cb.toString();
      expect(() => name.toLowerCase()).not.toEqual("[object object]");
    });
  });
});

function getInteractionBroker() {
  const fakeClient = Substitute.for<Client>();
  const fakeMessage = Substitute.for<Message>();
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  fakeMessage.channel.returns({ type: ChannelType.GuildText });
  fakeClient.getMessage(Arg.all()).resolves(fakeMessage);
  const clientProvider = () => Promise.resolve(fakeClient);
  return new InteractionBroker(clientProvider);
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
