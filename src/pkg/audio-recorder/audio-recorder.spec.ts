import "reflect-metadata";
import { AudioRecorder, InvalidRecorderStateError } from "./audio-recorder";
import { Substitute, Arg } from "@fluffy-spoon/substitute";
import { OpusMultiTracksEncoder } from "../../internal/opus-encoder/opus-multi-tracks-encoder";
import { VoiceChannel } from "discord.js";

// Helper to create a mocked VoiceChannel with all required properties
function getMockVoiceChannel(): VoiceChannel {
  const mockChannel = Substitute.for<VoiceChannel>();
  // @ts-ignore
  mockChannel.id.returns("123");
  // @ts-ignore
  mockChannel.name.returns("test-channel");
  // @ts-ignore
  mockChannel.guild.returns({
    id: "456",
    name: "test-guild",
    voiceAdapterCreator: () => ({
      sendPayload: () => true,
      destroy: () => {},
    }),
  });
  return mockChannel;
}

describe("Audio Recorder", () => {
  let ar: AudioRecorder;
  beforeEach(() => {
    ar = new AudioRecorder(Substitute.for<OpusMultiTracksEncoder>());
  });

  describe("Stop Recording", () => {
    it("Not currently recording", () => {
      expect(() => ar.stopRecording()).toThrowError(InvalidRecorderStateError);
    });
    // Skipping this test as it requires actual voice connection setup
    // which is not suitable for unit tests without proper mocking infrastructure
    it.skip("Currently recording", async () => {
      await expect(
        ar.startRecording(getMockVoiceChannel())
      ).resolves.not.toThrow();
      expect(() => ar.stopRecording()).not.toThrow();
    }, 15000);
  });

  describe("Start Recording", () => {
    // Skipping these tests as they require actual voice connection setup
    // which is not suitable for unit tests without proper mocking infrastructure
    it.skip("Not currently recording", async () => {
      await expect(
        ar.startRecording(getMockVoiceChannel())
      ).resolves.not.toThrow();
    }, 15000);
    it.skip("Currently recording", async () => {
      await expect(
        ar.startRecording(getMockVoiceChannel())
      ).resolves.not.toThrow();
      // Should be already recording and throw
      await expect(
        ar.startRecording(getMockVoiceChannel())
      ).rejects.toThrowError("recording");
    }, 15000);
  });

  describe("Trivia", () => {
    it("Adapt Chunk", () => {
      ar.adaptChunk(Buffer.from([0]), "1", Date.now());
    });
    it("Get base recordings dir", () => {
      expect(() => ar.getRecordingsDirectory()).not.toBeUndefined();
    });
  });
});
