import { ICommand } from "../@types/command";
import { Client, Message, VoiceChannel } from "eris";
import { inject, injectable } from "inversify";
import { TYPES } from "../types";
import { IRecorderService } from "../@types/audio-recorder";
import { InvalidRecorderStateError } from "../services/audio-recorder";

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
      await m.channel.createMessage(
        `${m.author.mention} You must be in a voice channel to resolve this command!`
      );
      return;
    }
    const channel = client.getChannel(voiceChannelId);
    try {
      const recordId = await this.audioRecorder.startRecording(
        channel as VoiceChannel
      );
      client.editStatus("online", {
        name: `${(channel as VoiceChannel).name}`,
        type: 2,
      });
      await m.channel.createMessage(
        `${m.author.mention} Starting record with id : ${recordId}`
      );
    } catch (e) {
      if (e instanceof InvalidRecorderStateError) {
        await m.channel.createMessage(
          `${m.author.mention} I'm already recording !`
        );
      }
    }
  }
}
