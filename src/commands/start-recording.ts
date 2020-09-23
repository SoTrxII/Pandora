import { ICommand } from "../@types/command";
import { Client, Message, VoiceChannel } from "eris";
import { inject, injectable } from "inversify";
import { TYPES } from "../types";
import { IRecorderService } from "../@types/audio-recorder";

@injectable()
export class StartRecording implements ICommand {
  trigger = "record";
  constructor(
    @inject(TYPES.AudioRecorder) private audioRecorder: IRecorderService
  ) {}
  async run(
    m: Message,
    client: Client,
    args: (string | number)[]
  ): Promise<void> {
    const voiceChannelId = m.member.voiceState.channelID;
    if (!voiceChannelId) {
      m.reply("You must be in a voice channel to resolve this command!");
      return;
    }
    const channel = client.getChannel(voiceChannelId);
    await this.audioRecorder.startRecording(channel as VoiceChannel);
    return Promise.resolve(undefined);
  }
}
