import { injectable } from "inversify";
import * as Eris from "eris";
import { IPandoraConfig } from "./@types/pandora";
import { Message, PossiblyUncachedTextableChannel } from "eris";
import { ICommandMatcher } from "./@types/command-matcher";
import { IRedisCommandBroker } from "./@types/redis-command-broker";
import { container } from "./inversify.config";
import { TYPES } from "./types";
import { IRecorderService } from "./@types/audio-recorder";

@injectable()
export class Pandora {
  constructor(
    private commandMatcher: ICommandMatcher,
    private redisBroker: IRedisCommandBroker,
    private config: IPandoraConfig
  ) {}
  public client = new Eris.Client(this.config.token);

  async bootUp(): Promise<void> {
    if (this.config.useCommands)
      this.client.on("messageCreate", (m) => this.matchCommand(m));

    if (this.config.useRedis) this.redisBroker.startListening(this.client);
    this.client.on("connect", () => console.log("Up & Ready"));
    this.client.on("error", (err, id) => this.handleConnectionError(err, id));
    try {
      await this.client.connect();
    } catch (e) {
      console.error(e);
    }
  }

  private handleConnectionError(e: Error, id: number): never {
    // Signal the listening process that an error has occurred and
    // let Pandora reboot
    if (e.message.includes("reset by peer")) {
      // As the audio recorder is a singleton, we can still get the initial record start time
      // I'm not really fond of this service locator anti-pattern
      // but this is an error case, so, hey, I've got an excuse
      const startTime = container
        .get<IRecorderService>(TYPES.AudioRecorder)
        .getStartTime();

      this.redisBroker.sendRecordingErrorEvent({
        hasError: true,
        data: { message: e.message, startTime: startTime },
      });
    }
    // Let pm2 reboot pandora
    throw e;
  }

  private isCommand(m: Message<PossiblyUncachedTextableChannel>): boolean {
    return m.content.startsWith(this.config.commandPrefix);
  }

  private isAuthorPandora(
    m: Message<PossiblyUncachedTextableChannel>
  ): boolean {
    return m.author.id === this.client.user.id;
  }

  async matchCommand(m: Message<PossiblyUncachedTextableChannel>) {
    if (!this.isAuthorPandora(m) && this.isCommand(m)) {
      try {
        m.content = m.content.substring(this.config.commandPrefix.length);
        await this.commandMatcher.execute(m, this.client);
      } catch (e) {
        console.error(e);
      }
    }
  }
}
