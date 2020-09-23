import { injectable } from "inversify";
import * as Eris from "eris";
import "./utils/eris-custom";
import { ICraigConfig } from "./@types/craig";
import { Message } from "eris";
import { ICommandMatcher } from "./@types/command-matcher";

@injectable()
export class Craig {
  constructor(
    private commandMatcher: ICommandMatcher,
    private config: ICraigConfig
  ) {}
  public client = new Eris.Client(this.config.token);

  async bootUp(): Promise<void> {
    this.client.on("messageCreate", (m) => this.matchCommand(m));
    this.client.on("connect", () => console.log("Up & Ready"));
    await this.client.connect();
  }

  private isCommand(m: Message): boolean {
    return m.content.startsWith(this.config.commandPrefix);
  }

  private isAuthorCraig(m: Message): boolean {
    return m.author.id === this.client.user.id;
  }

  async matchCommand(m: Message) {
    if (!this.isAuthorCraig(m) && this.isCommand(m)) {
      try {
        m.content = m.content.substring(this.config.commandPrefix.length);
        await this.commandMatcher.execute(m, this.client);
      } catch (e) {
        console.error(e);
      }
    }
  }
}
