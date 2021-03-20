import { inject, injectable } from "inversify";
import { TYPES } from "../types";
import {
  IRedisCommandBroker,
  RedisMessage,
} from "../@types/redis-command-broker";
import { IRedis } from "../@types/redis";
import { IRecorderService } from "../@types/audio-recorder";
import { Client, VoiceChannel } from "eris";

export enum SubChannels {
  StartRecording = "startRecordingDiscord",
  StopRecording = "stopRecordingDiscord",
}

export enum PubChannels {
  RecordingBegan = "recordingDiscordBegan",
  RecordingStopped = "recordingDiscordStopped",
}

@injectable()
export class RedisCommandBroker implements IRedisCommandBroker {
  private client: Client;
  constructor(
    @inject(TYPES.RedisService) private redis: IRedis,
    @inject(TYPES.AudioRecorder) private audioRecorder: IRecorderService
  ) {}

  startListening(client: Client): void {
    this.client = client;
    this.redis.subscribe(SubChannels.StartRecording);
    this.redis.subscribe(SubChannels.StopRecording);
    this.redis.on("message", (e) => this.messageBroker(e[0], JSON.parse(e[1])));
  }

  sendRecordingBeganEvent(payload?: RedisMessage): void {
    this.redis.publish(PubChannels.RecordingBegan, payload);
  }

  sendRecordingStoppedEvent(payload?: RedisMessage): void {
    this.redis.publish(PubChannels.RecordingStopped, payload);
  }

  private async messageBroker(channel: string, message: RedisMessage) {
    switch (channel) {
      case SubChannels.StartRecording:
        await this.startRecording(message);
        break;
      case SubChannels.StopRecording:
        await this.stopRecording(message);
        break;
      default:
        break;
    }
  }

  private async startRecording(message: RedisMessage): Promise<void> {
    let hasError = false;
    const voiceChannelId = message.data.voiceChannelId;
    let recordId;
    try {
      const channel = this.client.getChannel(voiceChannelId);
      if (!channel) throw new Error("No channel found");
      recordId = await this.audioRecorder.startRecording(
        channel as VoiceChannel
      );
    } catch (e) {
      console.error(e);
      hasError = true;
    }
    const returnPayload: RedisMessage = {
      data: { recordId: recordId },
      hasError: hasError,
    };
    this.sendRecordingBeganEvent(returnPayload);
  }

  private async stopRecording(message: RedisMessage): Promise<void> {
    let hasError = false;
    let startDate;
    try {
      startDate = await this.audioRecorder.stopRecording();
    } catch (e) {
      console.warn(e);
      hasError = true;
    }
    const returnPayload: RedisMessage = {
      data: { startDate: startDate },
      hasError: false,
    };
    console.log(returnPayload);
    console.log(JSON.stringify(returnPayload));
    this.sendRecordingStoppedEvent(returnPayload);
  }
}
