import {
  ApplicationCommand,
  ApplicationCommandStructure,
  AutocompleteInteraction,
  CommandInteraction,
  ComponentInteraction,
  Message,
  PingInteraction,
  PossiblyUncachedTextableChannel,
  TextableChannel,
  UnknownInteraction,
} from "eris";

/** All implementation specific bot properties.
 * We're not taking in the whole client and trying to have the bare minimum
 * function for testing to be easier and to adapt more easily to a non-Eris
 * implementation
 */
export interface IBotImpl {
  /** Bot user id, as a promise as we can't know when it will be available */
  client: {
    user: {
      id: string;
    };
  };
  /** Pointer to the event subscription function ("on") of the bot */
  on: (
    event: "interactionCreate",
    listener: (
      interaction:
        | PingInteraction
        | CommandInteraction
        | ComponentInteraction
        | AutocompleteInteraction
        | UnknownInteraction
    ) => void
  ) => any;

  /**
   * Register a new command interaction
   * @param command
   */
  createCommand(
    command: ApplicationCommandStructure
  ): Promise<ApplicationCommand>;

  /** Pointer to a function allowing a fetch a channel */
  getMessage: (
    channelID: string,
    messageID: string
  ) => Promise<Message<TextableChannel>>;
}
