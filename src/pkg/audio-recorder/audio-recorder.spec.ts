import "reflect-metadata";
import { AudioRecorder, InvalidRecorderStateError } from "./audio-recorder";
import { Substitute } from "@fluffy-spoon/substitute";
import { OpusMultiTracksEncoder } from "../../internal/opus-encoder/opus-multi-tracks-encoder";
import { VoiceChannel } from "eris";

describe("Audio Recorder", () => {
  let ar: AudioRecorder;
  beforeEach(() => {
    ar = new AudioRecorder(Substitute.for<OpusMultiTracksEncoder>());
  });

  describe("Stop Recording", () => {
    it("Not currently recording", () => {
      expect(() => ar.stopRecording()).toThrowError(InvalidRecorderStateError);
    });
    it("Currently recording", async () => {
      await expect(
        ar.startRecording(Substitute.for<VoiceChannel>())
      ).resolves.not.toThrow();
      expect(() => ar.stopRecording()).not.toThrow();
    });
  });

  describe("Start Recording", () => {
    it("Not currently recording", async () => {
      await expect(
        ar.startRecording(Substitute.for<VoiceChannel>())
      ).resolves.not.toThrow();
    });
    it("Currently recording", async () => {
      await expect(
        ar.startRecording(Substitute.for<VoiceChannel>())
      ).resolves.not.toThrow();
      // Should be already recording and throw
      await expect(
        ar.startRecording(Substitute.for<VoiceChannel>())
      ).rejects.toThrowError("recording");
    });
  });

  describe("Trivia", () => {
    it("Heartbeat", () => {
      expect(() => ar.heartbeat()).not.toThrow();
    });
    it("Adapt Chunk", () => {
      ar.adaptChunk(Buffer.from([0]), "1", Date.now());
    });
    it("Get base recordings dir", () => {
      expect(() => ar.getRecordingsDirectory()).not.toBeUndefined();
    });
  });
});
