import { Client, Message } from "eris";

export interface ICommandMatcher {
  execute(commandMessage: Message, client: Client): Promise<void>;
}
