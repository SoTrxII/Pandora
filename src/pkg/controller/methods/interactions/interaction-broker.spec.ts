import "reflect-metadata";
import { InteractionBroker } from "./interaction-broker";
import { Arg, Substitute } from "@fluffy-spoon/substitute";
import {
  Client,
  ChatInputCommandInteraction,
  GuildChannel,
  Message,
  ChannelType,
} from "discord.js";
import {
  BrokerError,
  IController,
  IRecordAttemptInfo,
  RECORD_EVENT,
} from "../../bot-control.types";

describe("Interactions broker", () => {
  describe("Process commands", () => {
    let ib: InteractionBroker;
    beforeAll(async () => {
      ib = await getInteractionBroker();
    });
    it("Known command start : OK", async () => {
      const startInteraction = Substitute.for<ChatInputCommandInteraction>();
      startInteraction.commandName.returns("record");
      startInteraction.deferReply().resolves(undefined as any);
      startInteraction.editReply(Arg.any()).resolves({} as any);
      startInteraction.fetchReply().resolves({} as any);
      await ib.start();
      await expect(
        ib.handleInteraction(startInteraction)
      ).resolves.not.toThrow();
    });
    it("Known command end : OK", async () => {
      const endInteraction = Substitute.for<ChatInputCommandInteraction>();
      endInteraction.commandName.returns("end");
      endInteraction.deferReply().resolves(undefined as any);
      await ib.start();
      // In this case, this should trigger an error because there is no started record
      await expect(ib.handleInteraction(endInteraction)).rejects.toThrow();
    });
    it("Unknown command : KO", async () => {
      const unknownInteraction = Substitute.for<ChatInputCommandInteraction>();
      unknownInteraction.commandName.returns("unknown");
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
  const fakeChannel = Substitute.for<any>();

  // Mock channel methods
  fakeChannel.isTextBased().returns(true);
  fakeChannel.messages.returns({ fetch: () => Promise.resolve(fakeMessage) });

  // Mock client methods
  fakeClient.channels.returns({
    fetch: () => Promise.resolve(fakeChannel),
  } as any);

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
