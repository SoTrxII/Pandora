import {
  Interaction,
  Message,
  ApplicationCommandData,
  Client,
} from "discord.js";

/** All implementation specific bot properties.
 * We're not taking in the whole client and trying to have the bare minimum
 * function for testing to be easier and to adapt more easily to a non-Discord.js
 * implementation
 */
export interface IBotImpl {
  /** Bot user id, as a promise as we can't know when it will be available */
  user: {
    id: string;
  } | null;

  /** Pointer to the event subscription function ("on") of the bot */
  on: (
    event: "interactionCreate",
    listener: (interaction: Interaction) => void
  ) => any;

  /**
   * Register commands
   */
  application: Client["application"];

  /** Channels manager */
  channels: Client["channels"];
}
