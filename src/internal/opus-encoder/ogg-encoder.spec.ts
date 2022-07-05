import "reflect-metadata";
import { OggEncoder } from "./ogg-encoder";
import { tmpdir } from "os";
import { createWriteStream, unlinkSync } from "fs";
import { join } from "path";

describe("OGG encoder", () => {
  let stream;
  let streamName: string;
  let encoder: OggEncoder;
  beforeAll(() => {
    streamName = join(tmpdir(), `stream-${Date.now()}`);
    stream = createWriteStream(streamName);
    encoder = new OggEncoder(stream);
  });

  it("Should be able to write a packet", () => {
    // As we cannot test if the packet written is correct as this level
    // this only test the whole method
    encoder.write(1, 1, 1, Buffer.alloc(1));
    encoder.end();
  });

  afterAll(() => {
    try {
      unlinkSync(streamName);
    } catch (e) {
      // This can already be deleted at this point
    }
  });
});
