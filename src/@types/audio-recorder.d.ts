import { VoiceChannel } from "eris";

export interface IRecorderService {
  startRecording(voiceChannel: VoiceChannel): Promise<string>;
  stopRecording();
}

export interface Chunk extends Buffer {
  timestamp: number;
  time?: number;
}
