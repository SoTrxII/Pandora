import { ICommand } from "../@types/command";
import { Client, Message, VoiceChannel } from "eris";
import { inject, injectable } from "inversify";
import { TYPES } from "../types";
import { IRecorderService } from "../@types/audio-recorder";
import { InvalidRecorderStateError } from "../services/audio-recorder";
import { IRedisCommandBroker } from "../@types/redis-command-broker";

@injectable()
export class StopRecording implements ICommand {
  trigger = "end";
  constructor(
    @inject(TYPES.AudioRecorder) private audioRecorder: IRecorderService,
    @inject(TYPES.RedisCommandBroker) private redis: IRedisCommandBroker
  ) {}
  async run(
    m: Message,
    client: Client,
    args: (string | number)[]
  ): Promise<void> {
    try {
      const startDate = this.audioRecorder.stopRecording();
      this.redis?.sendRecordingStoppedEvent({
        data: { startDate: startDate },
        hasError: false,
      });
      client.editStatus("online", null);
    } catch (e) {
      if (e instanceof InvalidRecorderStateError) {
        await m.channel.createMessage(
          `${m.author.mention} But I'm not recording`
        );
      }
    }
  }
}
