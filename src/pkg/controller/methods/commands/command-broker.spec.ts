/* eslint-disable @typescript-eslint/ban-ts-comment */
import "reflect-metadata";
import { CommandBroker } from "./command-broker";
import { Substitute, Arg } from "@fluffy-spoon/substitute";
import { Message, ChannelType } from "discord.js";
import {
  BrokerError,
  IController,
  IRecordAttemptInfo,
  RECORD_EVENT,
} from "../../bot-control.types";

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
    let cb: CommandBroker;
    beforeAll(async () => {
      cb = await getCommandBroker();
    });
    it("Known command : OK", async () => {
      // processMessage handles the start command and emits start event
      await expect(
        cb.processMessage("1", "1", BOT_COMMANDS.start, {
          id: "2",
          username: "test",
          voiceChannelId: "1",
        })
      ).resolves.not.toThrow();
      // The command was processed successfully
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
      ): Promise<Message> => {
        const message = Substitute.for<Message>();
        const mockAuthor = Substitute.for<any>();
        mockAuthor.id.returns("2");
        mockAuthor.username.returns("test");
        //@ts-ignore
        message.author.returns(mockAuthor);
        //@ts-ignore
        message.channel.returns({ type: ChannelType.DM });
        const mockVoiceState = Substitute.for<any>();
        mockVoiceState.channelId.returns(null);
        //@ts-ignore
        message.member.returns({ voice: mockVoiceState });
        return Promise.resolve(message);
      };
      const cb = await getCommandBrokerWithChannel(false, mockFetchMsg);
      await expect(cb.attemptStartEvent("2", "2", "2")).rejects.toThrow(
        BrokerError
      );
      await expect(cb.attemptStartEvent("2", "2", "2")).rejects.toThrow(
        "text channel"
      );
    });

    it("Error when the user wasn't in a voice channel", async () => {
      const mockFetchMsg = (
        channelId: string,
        messageId: string
      ): Promise<Message> => {
        const message = Substitute.for<Message>();
        const mockAuthor = Substitute.for<any>();
        mockAuthor.id.returns("2");
        mockAuthor.username.returns("test");
        //@ts-ignore
        message.author.returns(mockAuthor);
        // TS check against the mocked object methods, but the mock has more
        //@ts-ignore
        message.channel.returns({ type: ChannelType.GuildText });
        const mockVoiceState = Substitute.for<any>();
        mockVoiceState.channelId.returns(null);
        //@ts-ignore
        message.member.returns({ voice: mockVoiceState });
        return Promise.resolve(message);
      };
      const cb = await getCommandBroker(undefined, getMockFetchMsg());
      const rej = await expect(cb.attemptStartEvent("2", "2", null as any))
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
      ): Promise<Message> => {
        const message = Substitute.for<Message>();
        const mockAuthor = Substitute.for<any>();
        mockAuthor.id.returns("2");
        mockAuthor.username.returns("test");
        //@ts-ignore
        message.author.returns(mockAuthor);
        // TS check against the mocked object methods, but the mock has more
        //@ts-ignore
        message.channel.returns({ type: ChannelType.GuildText });
        const mockVoiceState = Substitute.for<any>();
        mockVoiceState.channelId.returns(null);
        //@ts-ignore
        message.member.returns({ voice: mockVoiceState });
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
      const mockFetchMsg = (
        channelId: string,
        messageId: string
      ): Promise<Message> => {
        // Create message as plain object to avoid Substitute issues with nested properties
        const message = {
          author: { id: "2", username: "test" },
          channel: { type: ChannelType.GuildText },
          member: {
            id: "2",
            voice: { channelId: "voice-123" },
          },
        } as any as Message;
        return Promise.resolve(message);
      };
      const cb = await getCommandBroker(undefined, mockFetchMsg);
      const startEventFired = waitEvent<IRecordAttemptInfo>(cb, "start");
      // TODO :: Type check the end event return type
      const endEventFired = waitEvent<any>(cb, "end");
      await cb.attemptStartEvent("2", "2", "voice-123");
      await expect(startEventFired).resolves.not.toThrow();
      await cb.attemptEndEvent({ id: "2", username: "test" });
      await expect(endEventFired).resolves.not.toThrow();
    });
  });
  describe("Start the broker", () => {
    const mockMsgSubPointer = (
      event: "messageCreate",
      listener: (message: Message) => void
    ) => {
      setTimeout(() => listener(Substitute.for<Message>()), 2000);
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
    let cb: CommandBroker;
    beforeAll(async () => {
      cb = await getCommandBroker();
    });
    it("Give a valid state at any time", async () => {
      await cb.getState();
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
      // True if the send method has been called at least once
      let hasBeenCalled = false;
      const mockFetchMsg = (
        channelId: string,
        messageId: string
      ): Promise<Message> => {
        // Use plain object for entire message to ensure properties work correctly
        const message = {
          author: { id: "2", username: "test" },
          channel: {
            type: ChannelType.GuildText,
            send: async (content: any) => {
              hasBeenCalled = true;
              return {} as Message;
            },
          },
          member: {
            voice: { channelId: null },
          },
        } as any as Message;
        return Promise.resolve(message);
      };
      const cb = await getCommandBroker(undefined, mockFetchMsg);
      await cb.attemptStartEvent("2", "2", "voice-456");
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
    listener: (message: Message) => void
  ) => any,
  fetchMsgPtr?: (channelId: string, messageId: string) => Promise<Message>
): Promise<CommandBroker> {
  // Fake event handler to handle incoming discord messages
  const mockSubMsgPtr =
    Substitute.for<
      (event: "messageCreate", listener: (message: Message) => void) => any
    >();
  // Fake query to retrieve details of a message from the discord API
  const mockFetchMsgPtr = (
    channelId: string,
    messageId: string
  ): Promise<Message> => {
    const mockMessage = Substitute.for<Message>();
    const mockAuthor = Substitute.for<any>();
    mockAuthor.id.returns("2");
    mockAuthor.username.returns("test");
    //@ts-ignore
    mockMessage.author.returns(mockAuthor);
    //@ts-ignore
    mockMessage.member.returns({ id: "2" });
    return Promise.resolve(mockMessage);
  };
  const mockClient = Substitute.for<any>();
  mockClient.user.returns({ id: "1" } as any);
  mockClient.on = subMsgPtr ?? mockSubMsgPtr;
  mockClient.channels.returns({
    fetch: async (channelId: string) => {
      const actualFetch = fetchMsgPtr ?? mockFetchMsgPtr;
      // Use plain object instead of Substitute to ensure messages.fetch works
      const channel = {
        isTextBased: () => true,
        type: ChannelType.GuildText,
        messages: {
          fetch: actualFetch,
        },
      };
      return channel;
    },
  } as any);
  const cb = new CommandBroker(
    BOT_CMD_PREFIX,
    () => Promise.resolve(mockClient),
    BOT_COMMANDS
  );
  await cb.start();
  return cb;
}

async function getCommandBrokerWithChannel(
  isTextBased: boolean,
  fetchMsgPtr?: (channelId: string, messageId: string) => Promise<Message>
): Promise<CommandBroker> {
  const mockFetchMsgPtr = (
    channelId: string,
    messageId: string
  ): Promise<Message> => {
    const mockMessage = Substitute.for<Message>();
    const mockAuthor = Substitute.for<any>();
    mockAuthor.id.returns("2");
    mockAuthor.username.returns("test");
    //@ts-ignore
    mockMessage.author.returns(mockAuthor);
    //@ts-ignore
    mockMessage.member.returns({ id: "2" });
    return Promise.resolve(mockMessage);
  };
  const mockClient = Substitute.for<any>();
  mockClient.user.returns({ id: "1" } as any);
  mockClient.on = Substitute.for<any>();
  mockClient.channels.returns({
    fetch: async (channelId: string) => {
      const actualFetch = fetchMsgPtr ?? mockFetchMsgPtr;
      // Use plain object instead of Substitute to ensure messages.fetch works
      const channel = {
        isTextBased: () => isTextBased,
        type: isTextBased ? ChannelType.GuildText : ChannelType.DM,
        messages: {
          fetch: actualFetch,
        },
      };
      return channel;
    },
  } as any);
  const cb = new CommandBroker(
    BOT_CMD_PREFIX,
    () => Promise.resolve(mockClient),
    BOT_COMMANDS
  );
  await cb.start();
  return cb;
}

function getMockFetchMsg(opt?: {
  errorChannel?: boolean;
  errorMember?: boolean;
}): (channelId: string, messageId: string) => Promise<Message> {
  return (channelId: string, messageId: string): Promise<Message> => {
    // Use plain object to avoid Substitute issues
    // When errorMember is true, use a different author ID to simulate wrong user
    const authorId = opt?.errorMember ? "999" : "2";
    const message: any = {
      author: {
        id: authorId,
        username: opt?.errorMember ? "other-user" : "test",
      },
      channel: {
        type: opt?.errorChannel ? ChannelType.DM : ChannelType.GuildText,
      },
    };

    if (opt?.errorMember === undefined) {
      message.member = {
        id: authorId,
        voice: { channelId: null },
      };
    }

    return Promise.resolve(message as Message);
  };
}
