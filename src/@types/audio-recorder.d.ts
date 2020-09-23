import { VoiceChannel } from "eris";

export interface IRecorderService {
  startRecording(voiceChannel: VoiceChannel);
  stopRecording();
}

export interface Chunk extends Buffer {
  timestamp: number;
  time?: number;
}
