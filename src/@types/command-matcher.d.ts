import { Client, Message, PossiblyUncachedTextableChannel } from "eris";

export interface ICommandMatcher {
  execute(
    commandMessage: Message<PossiblyUncachedTextableChannel>,
    client: Client
  ): Promise<void>;
}
