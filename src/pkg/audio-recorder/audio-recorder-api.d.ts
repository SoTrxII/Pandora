import { VoiceChannel } from "discord.js";

type AccurateTime = [number, number];

export interface IRecorderService {
  startRecording(voiceChannel: VoiceChannel): Promise<string>;

  stopRecording(): void;

  /**
   * Set a handler for a error happening while recording
   * @param event
   * @param errorHandler
   */
  on(event: "error", errorHandler: (err: Error) => void): this;

  /**
   * Listener for debug messages
   * @param event
   * @param handler function to trigger when even is fired
   */
  on(event: "debug", handler: (message: string) => void): this;

  /**
   * Remove all listeners for errors
   * @param event event to remove handlers
   */
  removeAllListeners(event: "error" | "debug"): this;

  /**
   * Return the base path of the recording directory
   */
  getRecordingsDirectory(): string;
}

export interface Chunk extends Buffer {
  timestamp: number;
  time?: number;
}
