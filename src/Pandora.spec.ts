/* eslint-disable @typescript-eslint/ban-ts-comment */
import "reflect-metadata";
import { Pandora } from "./Pandora";
import { Substitute } from "@fluffy-spoon/substitute";
import { Client } from "eris";
import {
  IController,
  IControllerState,
  IUnifiedBotController,
} from "./pkg/controller/bot-control.types";
import { IRecorderService } from "./pkg/audio-recorder/audio-recorder-api";
import {
  IRecordingState,
  IRecordingStore,
} from "./pkg/state-store/state-store.api";
import { plainTextLogger } from "./pkg/logger/logger-plain-text";
import { ILogger, ILoggerOpts } from "./pkg/logger/logger-api";

describe("Pandora", () => {
  describe("Boot-up state", () => {
    it("Do not launch recovery when the state is clean", async () => {
      const pandora = getMockedPandora({ stateStore: getMockedStore().empty });
      await expect(pandora.isResumingFromError()).resolves.toEqual(false);
    });
    it("Launch recovery when state is dirty", async () => {
      const pandora = getMockedPandora({ stateStore: getMockedStore().filled });
      await expect(pandora.isResumingFromError()).resolves.toEqual(true);
    });
    it("Boot up with an empty state", async () => {
      const pandora = getMockedPandora({ stateStore: getMockedStore().empty });
      await expect(pandora.bootUp()).resolves.not.toThrow();
    });
    it("Boot up with a dirty state", async () => {
      const pandora = getMockedPandora({ stateStore: getMockedStore().filled });
      await expect(pandora.bootUp()).resolves.not.toThrow();
    });
  });
  describe("Resume recording", () => {
    it("Can recover", async () => {
      const store = getMockedStore().filled;
      const pandora = getMockedPandora({
        unifiedController: getMockedUController().canResume,
        stateStore: store,
      });
      await pandora.resumeRecording();
      // If the recording can resume, the state should be untouched
      expect(store.getState()).not.toEqual(undefined);
    });
    it("Cannot recover", async () => {
      const store = getMockedStore().filled;
      const pandora = getMockedPandora({
        unifiedController: getMockedUController().cannotResume,
        stateStore: store,
      });
      try {
        await pandora.resumeRecording();

      }catch (e){}
      // If the recording can't resume, we have to clean up the state to return
      // to a coherent state
      await expect(store.getState()).resolves.toEqual(undefined);
    });
  });
  describe("Commands", () => {
    it("'start' handler", async () => {
      const pandora = getMockedPandora({ stateStore: getMockedStore().empty });
      await expect(
        pandora.onStartCommand(undefined, {
          voiceChannelId: "2",
        })
      ).rejects.toThrowError("controller is not defined");
    });
    it("'end' handler", async () => {
      const pandora = getMockedPandora({ stateStore: getMockedStore().empty });
      try {
        await pandora.onEndCommand(undefined, undefined);
        throw new Error("Has not thrown");
      } catch (e) {
        // If the recording properly started, it should not be able to
        // get the voiceChannel. Any other error would be weird
        if (!e.message.toLowerCase().includes("controller is not defined")) {
          throw e;
        }
      }
    });
  });
  describe("Start a recording", () => {
    it("Do not launch recovery when the state is clean", async () => {
      const pandora = getMockedPandora({ stateStore: getMockedStore().empty });
      await pandora.bootUp();
      await expect(
        pandora.startRecording(Substitute.for<IController>(), {
          voiceChannelId: "2",
        })
      ).resolves.not.toThrow();
    });
  });
  describe("End a recording", () => {
    it("End a recording when not started beforehand", async () => {
      const logger = getMockedLogger();
      const pandora = getMockedPandora({
        // State is empty -> no pending recording
        stateStore: getMockedStore().empty,
        logger: logger,
      });
      await pandora.bootUp();
      await expect(
        pandora.endRecording(Substitute.for<IController>(), undefined)
      ).resolves.not.toThrow();
      const lastMessage = logger.getStack().pop();
      expect(lastMessage.message).toContain("Aborting");
    });
    it("End a recording when started beforehand", async () => {
      const logger = getMockedLogger();
      const pandora = getMockedPandora({
        // State is empty -> no pending recording
        stateStore: getMockedStore().filled,
        logger: logger,
      });
      await pandora.bootUp();
      await expect(
        pandora.endRecording(Substitute.for<IController>(), undefined)
      ).resolves.not.toThrow();
    });
  });
});

function getMockedPandora(
  overrides?: Partial<{
    clientProvider: any;
    unifiedController: any;
    audioRecorder: any;
    stateStore: any;
    logger: any;
  }>
) {
  const defaults = {
    clientProvider: () => Substitute.for<Client>(),
    unifiedController: Substitute.for<IUnifiedBotController>(),
    audioRecorder: Substitute.for<IRecorderService>(),
    stateStore: Substitute.for<IRecordingStore>(),
    logger: plainTextLogger,
  };
  const opt = Object.assign(defaults, overrides);

  // Typescript doesn't like that the mocked version of the objects don't have
  // the same exact method signature, we have to silence it
  return new Pandora(
    //@ts-ignore
    opt.clientProvider,
    opt.unifiedController,
    opt.audioRecorder,
    opt.stateStore,
    opt.logger
  );
}

function getMockedStore() {
  // Empty store
  const emptyStore: Partial<IRecordingStore> = {
    getState(): Promise<IRecordingState | undefined> {
      return undefined;
    },
  };
  let value: IRecordingState = {
    recordsIds: ["1"],
    voiceChannelId: "1",
    controllerState: { name: "TEST" },
  } as IRecordingState;
  const filledStore: Partial<IRecordingStore> = {
    getState(): Promise<IRecordingState | undefined> {
      return Promise.resolve(value);
    },
    deleteState(): Promise<void> {
      value = undefined;
      return;
    },
    setState(state: IRecordingState): Promise<void> {
      state = value;
      return;
    },
  };
  return {
    empty: emptyStore,
    filled: filledStore,
  };
}

function getMockedUController() {
  const canResume: Partial<IUnifiedBotController> = {
    resumeFromState(state: IControllerState): Promise<boolean> {
      return Promise.resolve(true);
    },
  };
  const cannotResume: Partial<IUnifiedBotController> = {
    resumeFromState(state: IControllerState): Promise<boolean> {
      return Promise.resolve(false);
    },
  };

  return {
    canResume,
    cannotResume,
  };
}

function getMockedLogger() {
  const msgStack = [];
  return {
    debug(message: string, opts?: ILoggerOpts) {
      msgStack.push({ level: "debug", message: message });
    },
    error(message: string, opts?: ILoggerOpts) {
      msgStack.push({ level: "error", message: message });
    },
    info(message: string, opts?: ILoggerOpts) {
      msgStack.push({ level: "info", message: message });
    },
    warn(message: string, opts?: ILoggerOpts) {
      msgStack.push({ level: "warn", message: message });
    },
    getStack: () => msgStack,
  };
}
