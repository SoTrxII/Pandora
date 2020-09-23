import { injectable, multiInject } from "inversify";
import { TYPES } from "../types";
import { ICommand } from "../@types/command";
import { Client, Message } from "eris";
import { ICommandMatcher } from "../@types/command-matcher";

@injectable()
export class CommandMatcher implements ICommandMatcher {
  constructor(@multiInject(TYPES.Command) private commands: ICommand[]) {}

  async execute(commandMessage: Message, client: Client): Promise<void> {
    const commandWithArgs = commandMessage.content.split(/\s+/);
    const match = this.commands.find((c) => c.trigger === commandWithArgs[0]);
    //Remove the trigger from the array
    commandWithArgs.shift();
    await match?.run(commandMessage, client, commandWithArgs);
  }
}
