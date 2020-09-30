import { ICommand } from "../@types/command";
import { Client, Message, VoiceChannel } from "eris";
import { inject, injectable } from "inversify";
import { TYPES } from "../types";
import { IRecorderService } from "../@types/audio-recorder";
import { InvalidRecorderStateError } from "../services/audio-recorder";

@injectable()
export class StopRecording implements ICommand {
  trigger = "end";
  constructor(
    @inject(TYPES.AudioRecorder) private audioRecorder: IRecorderService
  ) {}
  async run(
    m: Message,
    client: Client,
    args: (string | number)[]
  ): Promise<void> {
    try {
      this.audioRecorder.stopRecording();
    } catch (e) {
      if (e instanceof InvalidRecorderStateError) {
        await m.reply(`But I'm not recording !`);
      }
    }
  }
}
