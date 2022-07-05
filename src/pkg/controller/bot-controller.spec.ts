import "reflect-metadata";
import { BotController } from "./bot-controller";
import {
  IController,
  IControllerState,
  RECORD_EVENT,
} from "./bot-control.types";
import * as EventEmitter from "events";

describe("Bot controller", () => {
  const [broker, controller] = getMockedController();

  describe("Check events emitted", () => {
    const samplePayload = "meh";
    const eventPayloads = [
      {
        evtName: "debug",
        payload: samplePayload,
        expected: { message: samplePayload, controller: broker },
      },
      {
        evtName: "error",
        payload: samplePayload,
        expected: { error: samplePayload, controller: broker },
      },
      {
        evtName: "start",
        payload: samplePayload,
        expected: { data: samplePayload, controller: broker },
      },
      {
        evtName: "end",
        payload: samplePayload,
        expected: { data: samplePayload, controller: broker },
      },
    ];
    it.each(eventPayloads)(
      "Checking event %s with payload %s",
      async (testObj) => {
        await controller.initialize();
        const eventEmitted = waitEvent(controller, testObj.evtName as any);
        broker.emit(testObj.evtName, testObj.payload);
        const received = await eventEmitted;
        expect(received).toEqual(testObj.expected);
      }
    );
  });

  it("Resume from state when a controller can resume", async () => {
    // This is only testing "if any controller answer true, then return true"
    // How the controller can resume is tested by the controller itself
    const canResume = await controller.resumeFromState({
      name: "test",
      data: undefined,
    });
    expect(canResume).toEqual(true);
  });

  it("Do not throw when no controller can resume", async () => {
    // No controller for this one
    const controller = new BotController([]);
    await expect(
      controller.resumeFromState({ name: "test", data: undefined })
    ).resolves.toEqual(false);
  });
});

/**
 * Return a bot controller provided with a mock broker
 */
function getMockedController(): [EventEmitter, BotController] {
  /** Mock class */
  class MockedBroker extends EventEmitter implements IController {
    getState(): Promise<IControllerState> {
      return Promise.resolve(undefined);
    }

    resumeFromState(state: IControllerState): Promise<boolean> {
      return Promise.resolve(true);
    }

    sendMessage(message: string): Promise<number> {
      return Promise.resolve(0);
    }

    signalState(
      event: RECORD_EVENT,
      payload?: Record<string, unknown>
    ): Promise<void> {
      return Promise.resolve(undefined);
    }

    start(): Promise<void> {
      return Promise.resolve(undefined);
    }
  }
  const broker = new MockedBroker();
  return [broker, new BotController([broker])];
}

/**
 * Wait for a specific event to be fired by a controller
 * @param cb
 * @param evt
 * @param opt
 */
async function waitEvent<T>(
  cb: BotController,
  evt: "start" | "end" | "error" | "debug",
  opt = { timeout: 3000 }
): Promise<T> {
  return new Promise<T>((res, rej) => {
    setTimeout(() => rej("Timeout"), opt.timeout);
    cb.on(evt as any, (payload) => res(payload as unknown as T));
  });
}
