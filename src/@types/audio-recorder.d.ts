import { VoiceChannel } from "eris";

type AccurateTime = [number, number];

export interface IRecorderService {
  startRecording(voiceChannel: VoiceChannel): Promise<string>;
  stopRecording(): AccurateTime;
  getStartTime(): AccurateTime;
}

export interface Chunk extends Buffer {
  timestamp: number;
  time?: number;
}
