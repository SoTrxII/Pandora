import { injectable } from "inversify";
import * as Eris from "eris";
import "./utils/eris-custom";
import { IPandoraConfig } from "./@types/pandora";
import { Message } from "eris";
import { ICommandMatcher } from "./@types/command-matcher";
import { IRedis } from "./@types/redis";
import { IRedisCommandBroker } from "./@types/redis-command-broker";

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
    await this.client.connect();
  }

  private isCommand(m: Message): boolean {
    return m.content.startsWith(this.config.commandPrefix);
  }

  private isAuthorPandora(m: Message): boolean {
    return m.author.id === this.client.user.id;
  }

  async matchCommand(m: Message) {
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
