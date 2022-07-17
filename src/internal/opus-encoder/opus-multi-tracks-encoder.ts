import { resolve } from "path";
import { createWriteStream, existsSync, mkdirSync } from "fs";
import { Writable } from "stream";
import { OggEncoder } from "./ogg-encoder";
import { User } from "eris";
import { Chunk } from "../../pkg/audio-recorder/audio-recorder-api";
import { OpusEncoder } from "@discordjs/opus";
import { IMultiTracksEncoder, IRecordingDetails } from "./multi-tracks-encoder";
import { injectable } from "inversify";

@injectable()
export class OpusMultiTracksEncoder implements IMultiTracksEncoder {
  private static BASE_STORAGE_DIR = resolve(__dirname, `../../rec`);
  private static readonly DISCORD_RATE = 48000;
  private static readonly DISCORD_FRAME_SIZE = 960;
  private static readonly DISCORD_CHANNEL_NUMBER = 2;
  // A precomputed Opus header, made by node-opus
  // prettier-ignore
  private static readonly OPUS_HEADER = [
    Buffer.from([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64, 0x01, 0x02,
      0x00, 0x0f, 0x80, 0xbb, 0x00, 0x00, 0x00, 0x00, 0x00]),
    Buffer.from([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73, 0x09, 0x00,
      0x00, 0x00, 0x6e, 0x6f, 0x64, 0x65, 0x2d, 0x6f, 0x70, 0x75, 0x73, 0x00,
      0x00, 0x00, 0x00, 0xff])
  ];

  // File Headers streams
  private fHStream: [Writable, Writable];
  private oggHStream: [OggEncoder, OggEncoder];
  // File Stream
  private fStream: Writable;
  private oggStream: OggEncoder;
  //TODO : Write unknown data to this file
  private ogg2Stream: OggEncoder;
  // File Users Stream
  private fUStream: Writable;

  private opus = new OpusEncoder(
    OpusMultiTracksEncoder.DISCORD_RATE,
    OpusMultiTracksEncoder.DISCORD_CHANNEL_NUMBER
  );

  /**
   * Initialize all files required for the record to be valid.
   * These are :
   * - Raw data streams
   * - List of users streams
   * - OGG headers streams
   * - Contextual info file
   * @param recordId generated record ID. Should be unique
   * @param details info to write in the info file
   */
  initStreams(recordId: string, details: IRecordingDetails): void {
    this.assertStorageDirCreated();
    const recordingFullPath = `${OpusMultiTracksEncoder.BASE_STORAGE_DIR}/${recordId}`;
    this.writeInfoFile(recordingFullPath, details);
    this.fHStream = [
      createWriteStream(recordingFullPath + ".ogg.header1"),
      createWriteStream(recordingFullPath + ".ogg.header2"),
    ];
    this.oggHStream = [
      new OggEncoder(this.fHStream[0]),
      new OggEncoder(this.fHStream[1]),
    ];
    this.fStream = createWriteStream(recordingFullPath + ".ogg.data");
    this.oggStream = new OggEncoder(this.fStream);
    this.fUStream = createWriteStream(recordingFullPath + ".ogg.users");
    this.fUStream.write('"0":{}\n');
  }

  /**
   * Add a new user to the list of recorded users
   * @param userTrackNo Index of the new user track
   * @param user user info
   */
  registerNewTrackForUser(userTrackNo: number, user: User): void {
    // Put a valid Opus header at the beginning
    try {
      this.addNewHeader(userTrackNo);
    } catch (e) {
      console.error(e);
    }
    const userData = {
      id: user.id,
      name: user.username,
      discrim: user.discriminator,
    };
    try {
      this.fUStream.write(
        ',"' + userTrackNo + '":' + JSON.stringify(userData) + "\n"
      );
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * Main method. Encode a raw discord audio chunk
   * @param streamNo stream offset
   * @param packetNo packet index. Should increment by 2, one for each stream (left/right)
   * @param chunk audio data
   */
  encodeChunk(streamNo: number, packetNo: number, chunk: Chunk): void {
    const chunkGranule = chunk.time;
    if (this.hasRTPHeader(chunk)) chunk = this.stripRTPHeader(chunk);
    if (packetNo % 50 === 49) {
      try {
        this.opus.decode(chunk);
      } catch (e) {
        console.error(e);
      }
    }
    // Write out the chunk itself
    this.write(this.oggStream, chunkGranule, streamNo, packetNo, chunk);
    // Then the timestamp for reference
    this.write(
      this.oggStream,
      chunk.timestamp ?? 0,
      streamNo,
      packetNo + 1,
      Buffer.alloc(0)
    );
  }

  /**
   * Write recent packets to the user specific stream.
   * Returns the updated packet number for this user
   */
  flush(
    streamNo: number,
    queue: Chunk[],
    ct: number,
    packetNo: number
  ): number {
    for (let i = 0; i < ct; i++) {
      const chunk = queue.shift();
      try {
        this.encodeChunk(streamNo, packetNo, chunk);
        packetNo += 2;
      } catch (ex) {
        console.error(ex);
      }
    }
    return packetNo;
  }

  /**
   * Properly close all open streams.
   * /!\ This doesn't flush any remaining data /!\
   */
  closeStreams(): void {
    this.oggHStream[0].end();
    this.oggHStream[1].end();
    this.oggStream.end();
    this.fUStream.end();
  }

  /**
   * Create the records directory
   */
  assertStorageDirCreated() {
    if (!existsSync(OpusMultiTracksEncoder.BASE_STORAGE_DIR))
      mkdirSync(OpusMultiTracksEncoder.BASE_STORAGE_DIR, { recursive: true });
  }

  /**
   * Write all the stream info into a file. Ths is a later on used in cooking (cook/recinfo.js)
   */
  writeInfoFile(fullPath: string, details: IRecordingDetails): void {
    const infoStream = createWriteStream(fullPath + ".ogg.info", {
      flags: "wx",
    });
    const info = {
      // TODO : Key and delete are attributes linked to the original Pandora Web service
      // Once I've ascertained these aren't used in cooking, I'll delete them from here
      key: "0",
      delete: "0",
      // TODO : Although this doesn't seems to be used, maybe include the actual requester ?
      requester: "anUser#433443",
      requesterId: "1111111111111",
      startTime: String(new Date().getTime()),
    };
    Object.assign(info, details);
    infoStream.write(JSON.stringify(info));
    infoStream.end();
  }

  /**
   * Ad a new header for a newly created user stream
   * @param userTrackNo
   */
  addNewHeader(userTrackNo: number): void {
    this.write(
      this.oggHStream[0],
      0,
      userTrackNo,
      0,
      OpusMultiTracksEncoder.OPUS_HEADER[0],
      OggEncoder.BOS
    );
    this.write(
      this.oggHStream[1],
      0,
      userTrackNo,
      1,
      OpusMultiTracksEncoder.OPUS_HEADER[1]
    );
  }

  /**
   * Write a chunk in the provided stream
   * @param stream stream to write into
   * @param granulePos timestamp
   * @param streamNo logical stream index
   * @param packetNo packet number
   * @param chunk audio data
   * @param flags flags (8 bits) type of this packet in the logicial bitsream
   */
  write(
    stream: OggEncoder,
    granulePos: number,
    streamNo: number,
    packetNo: number,
    chunk: Buffer,
    flags?: number
  ): void {
    stream.write(granulePos, streamNo, packetNo, chunk, flags);
  }

  /**
   * return true if the provided chunk has an RTP header
   * @param chunk
   */
  hasRTPHeader(chunk: Chunk): boolean {
    return chunk.length > 4 && chunk[0] === 0xbe && chunk[1] === 0xde;
  }

  /**
   * Remove the RTP header from the provided Chunk
   * /!\ use hasRtpHeader method to check if the header is present before
   * using this method, it will remove some data anyway
   * @param chunk
   */
  stripRTPHeader(chunk: Chunk): Chunk {
    const rtpHLen = chunk.readUInt16BE(2);
    let off = 4;

    for (let rhs = 0; rhs < rtpHLen && off < chunk.length; rhs++) {
      const subLen = (chunk[off] & 0xf) + 2;
      off += subLen;
    }
    while (off < chunk.length && chunk[off] === 0) off++;
    if (off >= chunk.length) off = chunk.length;

    return chunk.slice(off) as Chunk;
  }

  /**
   * Return the basepath for any recordings
   */
  getRecordingsDirectory(): string {
    return OpusMultiTracksEncoder.BASE_STORAGE_DIR;
  }
}
