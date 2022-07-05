import { User } from "eris";
import { Chunk } from "../../pkg/audio-recorder/audio-recorder-api";

export interface IRecordingDetails {
  guild: string;
  channel: string;
}

export interface IMultiTracksEncoder {
  initStreams(recordId: string, details: IRecordingDetails): void;

  registerNewTrackForUser(userTrackNo: number, user: User): void;

  encodeChunk(streamNo: number, packetNo: number, chunk: Chunk): void;

  flush(streamNo: number, queue: Chunk[], ct: number, packetNo: number): number;

  closeStreams(): void;
}
