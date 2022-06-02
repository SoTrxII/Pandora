import { decorate, injectable, multiInject } from "inversify";
import { TYPES } from "../../types";
import {
  IController,
  IControllerState,
  IUnifiedBotController,
} from "./bot-control.types";
import * as EventEmitter from "events";

decorate(injectable(), EventEmitter);

@injectable()
export class BotController
  extends EventEmitter
  implements IUnifiedBotController
{
  constructor(
    @multiInject(TYPES.Controller) private controllers: IController[]
  ) {
    super();
  }

  /**
   * Starts listening to user commands in any ways available
   */
  async initialize(): Promise<void> {
    await Promise.all(
      this.controllers.map(async (c) => {
        c.on("start", (data) =>
          this.emit("start", {
            data: data,
            controller: c,
          })
        );
        c.on("end", (data) =>
          this.emit("end", {
            data: data,
            controller: c,
          })
        );
        c.on("error", (data) =>
          this.emit("error", {
            error: data,
            controller: c,
          })
        );
        await c.start();
      })
    );
  }

  /**
   * Propagate a state to every controller to have at least one of them resume
   * @param state
   * @return True if at least one controller resumed
   */
  async resumeFromState(state: IControllerState): Promise<boolean> {
    const hasResumed = await Promise.all(
      this.controllers.map(async (c) => await c.resumeFromState(state))
    );
    return hasResumed.some((hasResumed) => hasResumed == true);
  }
}
