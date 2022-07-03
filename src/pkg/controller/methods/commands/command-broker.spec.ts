/* eslint-disable @typescript-eslint/ban-ts-comment */
import "reflect-metadata";
import { CommandBroker } from "./command-broker";
import { Substitute } from "@fluffy-spoon/substitute";
import {
  FileContent,
  Message,
  MessageContent,
  PossiblyUncachedTextableChannel,
  TextableChannel,
} from "eris";
import {
  BrokerError,
  IController,
  IRecordAttemptInfo,
  RECORD_EVENT,
} from "../../bot-control.types";
import { ChannelType } from "discord-api-types/v10";

const BOT_ID = "1";
const BOT_CMD_PREFIX = "!!";
const BOT_COMMANDS = { start: "start", end: "end" };

describe("Command Broker", () => {
  describe("Recognize a processable message", () => {
    const notCommandMessage = "dsggsdsg";
    const undefinedCommandMessage = BOT_CMD_PREFIX + "dsggsdsg";
    const startCommandMessage = BOT_CMD_PREFIX + BOT_COMMANDS.start;
    const endCommandMessage = BOT_CMD_PREFIX + BOT_COMMANDS.start;
    const validAuthor = "2";
    let cb;
    beforeAll(async () => {
      cb = await getCommandBroker();
    });
    it("Not a command : KO", async () => {
      await expect(
        cb.isMsgProcessable(notCommandMessage, validAuthor)
      ).resolves.toEqual(false);
    });
    it("Bot own message : KO", async () => {
      await expect(
        cb.isMsgProcessable(startCommandMessage, BOT_ID)
      ).resolves.toEqual(false);
    });
    it("Not a valid command : KO", async () => {
      await expect(
        cb.isMsgProcessable(undefinedCommandMessage, validAuthor)
      ).resolves.toEqual(false);
    });
    it("Only the prefix: KO", async () => {
      await expect(
        cb.isMsgProcessable(BOT_CMD_PREFIX + "  ", validAuthor)
      ).resolves.toEqual(false);
    });
    it("Start command : OK", async () => {
      await expect(
        cb.isMsgProcessable(startCommandMessage, validAuthor)
      ).resolves.toEqual(true);
    });
    it("end command : OK", async () => {
      await expect(
        cb.isMsgProcessable(endCommandMessage, validAuthor)
      ).resolves.toEqual(true);
    });
  });
  describe("Process a message", () => {
    let cb;
    beforeAll(async () => {
      cb = await getCommandBroker();
    });
    it("Known command : OK", async () => {
      const rej = await expect(
        cb.processMessage("1", "1", BOT_COMMANDS.start, {
          id: "2",
          username: "test",
          voiceChannelId: "1",
        })
      ).rejects;
      // With this configuration, we should get a text channel undefined error
      // This means that the command has been accepted but the record cannot start
      // this is ok as this isn't what we're testing there
      await rej.toThrow("text channel");

      // No error should be fired here
      const errorEventFired = waitEvent<any>(cb, "error");
      await expect(errorEventFired).resolves;
    });
    it("Unknown command : KO", async () => {
      const rej = await expect(
        cb.processMessage("1", "1", "unknown", {
          id: "2",
          username: "test",
          voiceChannelId: "1",
        })
      ).rejects;
      await rej.toThrowError(BrokerError);
      await rej.toThrow("not registered");
    });
  });
  describe("Start a new recording session", () => {
    it("Error when the command was not fired from a guild text channel", async () => {
      const mockFetchMsg = (
        channelId: string,
        messageId: string
      ): Promise<Message<TextableChannel>> => {
        const message = Substitute.for<Message<TextableChannel>>();
        message.channel.type = ChannelType.DM;
        message.member.voiceState = undefined;
        return Promise.resolve(message);
      };
      const cb = await getCommandBroker(undefined, mockFetchMsg);
      const rej = await expect(cb.attemptStartEvent("2", "2", "2")).rejects;
      // Check error type
      await rej.toThrowError(BrokerError);
      // and message
      await rej.toThrow("text channel");
    });

    it("Error when the user wasn't in a voice channel", async () => {
      const mockFetchMsg = (
        channelId: string,
        messageId: string
      ): Promise<Message<TextableChannel>> => {
        const message = Substitute.for<Message<TextableChannel>>();
        // TS check against the mocked object methods, but the mock has more
        //@ts-ignore
        message.channel.returns({ type: ChannelType.GuildText });
        message.member.voiceState = undefined;
        return Promise.resolve(message);
      };
      const cb = await getCommandBroker(undefined, mockFetchMsg);
      const rej = await expect(cb.attemptStartEvent("2", "2", undefined))
        .rejects;

      // Check error type
      await rej.toThrowError(BrokerError);
      // and message
      await rej.toThrow("voice channel");
    }, 10000);
    it("Should fire a 'start' event when ok", async () => {
      const MOCK_VC_ID = "2";
      const mockFetchMsg = (
        channelId: string,
        messageId: string
      ): Promise<Message<TextableChannel>> => {
        const message = Substitute.for<Message<TextableChannel>>();
        // TS check against the mocked object methods, but the mock has more
        //@ts-ignore
        message.channel.returns({ type: ChannelType.GuildText });
        message.member.voiceState = undefined;
        return Promise.resolve(message);
      };
      const cb = await getCommandBroker(undefined, mockFetchMsg);
      const startEventPayload = waitEvent<IRecordAttemptInfo>(cb, "start");
      await cb.attemptStartEvent("2", "2", MOCK_VC_ID);
      await expect(startEventPayload).resolves.not.toThrow();
      // Check payload
      expect(await startEventPayload).toEqual({
        voiceChannelId: MOCK_VC_ID,
      } as IRecordAttemptInfo);

      //cb.attemptStartEvent();
    });
  });
  describe("End a recording session", () => {
    it("Error when the user attempting to end the record session isn't the one having started the recording ", async () => {
      const cb = await getCommandBroker(
        undefined,
        getMockFetchMsg({ errorMember: true })
      );
      const startEventFired = waitEvent<IRecordAttemptInfo>(cb, "start");

      await cb.attemptStartEvent("2", "2", "2");
      await expect(startEventFired).resolves.not.toThrow();
      await expect(
        cb.attemptEndEvent({ id: "2", username: "test" })
      ).rejects.toThrowError(BrokerError);
    });

    it("Error when attempting to end a non-existant recording", async () => {
      const cb = await getCommandBroker(
        undefined,
        getMockFetchMsg({ errorChannel: true })
      );
      const rej = await expect(
        cb.attemptEndEvent({ id: "2", username: "test" })
      ).rejects;
      // Check error type
      await rej.toThrowError(BrokerError);
      // and message
      await rej.toThrow("end a record");
    });
    it("Should fire a 'end' event when ok", async () => {
      const cb = await getCommandBroker(undefined, getMockFetchMsg());
      const startEventFired = waitEvent<IRecordAttemptInfo>(cb, "start");
      // TODO :: Type check the end event return type
      const endEventFired = waitEvent<any>(cb, "end");
      await cb.attemptStartEvent("2", "2", "2");
      await expect(startEventFired).resolves.not.toThrow();
      await cb.attemptEndEvent({ id: "2", username: "test" });
      await expect(endEventFired).resolves.not.toThrow();
    });
  });
  describe("Start the broker", () => {
    const mockMsgSubPointer = (
      event: "messageCreate",
      listener: (message: Message<PossiblyUncachedTextableChannel>) => void
    ) => {
      setTimeout(
        () =>
          listener(Substitute.for<Message<PossiblyUncachedTextableChannel>>()),
        2000
      );
    };
    let cb;
    beforeAll(async () => {
      cb = await getCommandBroker(mockMsgSubPointer);
    });

    it("Start and receive events", async () => {
      // This can't fail
      await cb.start();
    });
  });
  describe("Provide a coherent state", () => {
    let cb;
    beforeAll(async () => {
      cb = await getCommandBroker();
    });
    it("Give a valid state at any time", () => {
      cb.getState();
    });
  });
  describe("Validate state", () => {
    let cb;
    beforeAll(async () => {
      cb = await getCommandBroker();
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
          name: "COMMAND",
          data: undefined,
        })
      ).toEqual(false);
    });
    it("A state for this controller, but with partial data", () => {
      expect(
        cb.validateState({
          name: "COMMAND",
          data: {
            textChannelId: 1,
          },
        })
      ).toEqual(false);
    });

    it("A valid state for this controller", () => {
      expect(
        cb.validateState({
          name: "COMMAND",
          data: {
            textChannelId: "1",
            voiceChannelId: "1",
            messageId: "1",
          },
        })
      ).toEqual(true);
    });
  });
  describe("Send a message", () => {
    it("Returns 0 when the message buffer isn't initialized", async () => {
      const cb = await getCommandBroker();
      await expect(cb.sendMessage("test")).resolves.toEqual(0);
    });
    it("Returns 1 when the message buffer is initialized", async () => {
      // True if the createMessage method has been called at least once
      let hasBeenCalled = false;
      const mockFetchMsg = (
        channelId: string,
        messageId: string
      ): Promise<Message<TextableChannel>> => {
        const message = Substitute.for<Message<TextableChannel>>();
        // TS check against the mocked object methods, but the mock has more
        //@ts-ignore
        message.channel.returns({
          type: ChannelType.GuildText,
          createMessage(
            content: MessageContent,
            file?: FileContent | FileContent[]
          ): Promise<any> {
            hasBeenCalled = true;
            return Promise.resolve(1);
          },
        });
        message.member.voiceState = undefined;
        return Promise.resolve(message);
      };
      const cb = await getCommandBroker(undefined, mockFetchMsg);
      await cb.attemptStartEvent("2", "2", "2");
      await expect(cb.sendMessage("test")).resolves.toEqual(1);
      expect(hasBeenCalled).toEqual(true);
    });
  });
  describe("Send signal", () => {
    it("Should have no effect", async () => {
      const cb = await getCommandBroker();
      await expect(
        cb.signalState(RECORD_EVENT.STARTED)
      ).resolves.toBeUndefined();
    });
  });
  describe("Trivia", () => {
    it("toString", async () => {
      const cb = await getCommandBroker();
      const name = cb.toString();
      expect(name.toLowerCase()).not.toEqual("[object object]");
    });
  });
});

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

async function getCommandBroker(
  subMsgPtr?: (
    event: "messageCreate",
    listener: (message: Message<PossiblyUncachedTextableChannel>) => void
  ) => any,
  fetchMsgPtr?: (
    channelId: string,
    messageId: string
  ) => Promise<Message<TextableChannel>>
): Promise<CommandBroker> {
  // Fake event handler to handle incoming discord messages
  const mockSubMsgPtr =
    Substitute.for<
      (
        event: "messageCreate",
        listener: (message: Message<PossiblyUncachedTextableChannel>) => void
      ) => any
    >();
  // Fake query to retrieve details of a message from the discord API
  const mockFetchMsgPtr = (
    channelId: string,
    messageId: string
  ): Promise<Message<TextableChannel>> => {
    const mockMessage = Substitute.for<Message<TextableChannel>>();
    mockMessage.member.id = "2";
    return Promise.resolve(mockMessage);
  };
  const cb = new CommandBroker(
    BOT_CMD_PREFIX,
    () =>
      Promise.resolve({
        client: {
          user: {
            id: "1",
          },
        },
        on: subMsgPtr ?? mockSubMsgPtr,
        getMessage: fetchMsgPtr ?? mockFetchMsgPtr,
      }),
    BOT_COMMANDS
  );
  await cb.start();
  return cb;
}

function getMockFetchMsg(opt?: {
  errorChannel?: boolean;
  errorMember?: boolean;
}): (
  channelId: string,
  messageId: string
) => Promise<Message<TextableChannel>> {
  return (
    channelId: string,
    messageId: string
  ): Promise<Message<TextableChannel>> => {
    const message = Substitute.for<Message<TextableChannel>>();
    // TS check against the mocked object methods, but the mock has more
    //@ts-ignore
    message.channel.returns({ type: ChannelType.GuildText });
    if (opt?.errorChannel !== undefined) {
      //@ts-ignore
      message.channel.returns({ type: ChannelType.DM });
    }

    if (opt?.errorMember === undefined) {
      //@ts-ignore
      message.member.returns({
        id: "2",
        voiceState: undefined,
      });
    }

    return Promise.resolve(message);
  };
}
