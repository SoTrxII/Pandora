import "reflect-metadata";
import { OpusMultiTracksEncoder } from "./opus-multi-tracks-encoder";
import { Chunk } from "../../pkg/audio-recorder/audio-recorder-api";
import { OggEncoder } from "./ogg-encoder";
import { Arg, Substitute } from "@fluffy-spoon/substitute";
import { readFileSync, unlinkSync } from "fs";
import { rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { IRecordingDetails } from "./multi-tracks-encoder";
import { setTimeout } from "timers/promises";
import { User } from "discord.js";

describe("Multi track encoder", () => {
  let mte: OpusMultiTracksEncoder;

  // RTP packet header
  const rtpHeader = [0xbe, 0xde];
  const getRtpChunk = (): Chunk => {
    const chunk = Buffer.from([...rtpHeader, 0, 0, 0, 1]);
    (chunk as Chunk).timestamp = Math.round(new Date().getTime() / 1000);
    return chunk as Chunk;
  };
  const getNullChunk = (): Chunk => {
    const chunk = Buffer.from([0, 0, 0, 0, 0, 1]);
    (chunk as Chunk).timestamp = Math.round(new Date().getTime() / 1000);
    return chunk as Chunk;
  };

  beforeEach(() => {
    mte = new OpusMultiTracksEncoder();
  });

  describe("RTP packet processing", () => {
    describe("Detection", () => {
      it("Yes", () => {
        expect(mte.hasRTPHeader(getRtpChunk())).toEqual(true);
      });
      it("No", () => {
        expect(mte.hasRTPHeader(getNullChunk())).toEqual(false);
      });
    });
    it("Stripping", () => {
      // We have to be careful, this method will remove the first n data of the
      // chunk without checking
      const origChunk = getRtpChunk();
      // Find the first non null data as stripping the RTP header will also get rid of any "0" data
      const index = origChunk.findIndex((v) => v !== 0);
      // If a non zero data isn't found, this mean that it will return an empty chunk
      const offset = index === -1 ? origChunk.length : index - 1;
      const processedChunk = mte.stripRTPHeader(origChunk);
      expect(processedChunk).toEqual(origChunk.slice(offset));
    });
  });

  it("Write into a stream", () => {
    const stream = Substitute.for<OggEncoder>();
    const chunk = getNullChunk();
    mte.write(stream, 0, 0, 0, chunk);
    // This will throw if not called
    stream.received().write(0, 0, 0, chunk);
  });

  describe("Initialized streams", () => {
    beforeEach(() => {
      mte.initStreams("0", { guild: "hh", channel: "hhd" });
    });
    it("Storage dir creation", () => {
      mte.assertStorageDirCreated();
    });

    it("Add a new header", () => {
      expect(() => mte.addNewHeader(1)).not.toThrow();
    });

    it("Encode chunk", () => {
      expect(() => mte.encodeChunk(0, 0, getNullChunk())).not.toThrow();
    });
    it("Register new track", () => {
      expect(() =>
        mte.registerNewTrackForUser(0, Substitute.for<User>())
      ).not.toThrow();
    });

    afterEach(async () => {
      mte.closeStreams();
      await rm("./src/rec", { recursive: true });
    });
  });

  describe("Info file", () => {
    const path = join(tmpdir(), `info-${Date.now()}`);
    it("Has every important properties", async () => {
      const details: IRecordingDetails = {
        channel: "testChannel",
        guild: "testGuild",
      };
      mte.writeInfoFile(path, details);
      // Wait a bit for the file to be actually written
      await setTimeout(3000);
      const file = JSON.parse(readFileSync(path + ".ogg.info", "utf8"));
      expect(file).toMatchObject(details);
    }, 10000);
    afterAll(() => {
      try {
        unlinkSync(path);
      } catch (e) {
        // It can be already deleted
      }
    });
  });

  it("Flush remaining data", () => {
    expect(() => mte.flush(0, [], 0, 0)).not.toThrow();
  });

  it("Get the recording basedir", () => {
    expect(() => mte.getRecordingsDirectory()).not.toBeUndefined();
  });
});
