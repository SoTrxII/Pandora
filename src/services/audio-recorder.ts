import {
  AccurateTime,
  Chunk,
  IRecorderService,
} from "../@types/audio-recorder";
import { User, VoiceChannel, VoiceConnection, VoiceDataStream } from "eris";
import { hrtime } from "process";
import { IMultiTracksEncoder } from "../@types/multi-tracks-encoder";
import { TYPES } from "../types";
import { inject, injectable } from "inversify";
import { Readable } from "stream";
import { resolve } from "path";
import Timeout = NodeJS.Timeout;

export class InvalidRecorderStateError extends Error {}
@injectable()
export class AudioRecorder implements IRecorderService {
  private static readonly MAX_PACKETS_QUEUE_LENGTH = 16;
  private isRecording = false;
  private voiceChannel: VoiceChannel;
  private voiceConnection: VoiceConnection;
  private voiceReceiver: VoiceDataStream;
  // Ping period in ms
  private static readonly PING_INTERVAL = 3000;
  private pingProcess: Timeout;
  private startTime: AccurateTime;
  // Active users, by ID
  private users = new Map<string, User>();
  // Our current track number
  private trackNo = 1;
  // Track numbers for each active user
  private userTrackNos = new Map<string, number>();
  // Packet numbers for each active user
  private userPacketNos = new Map<string, number>();
  // Packet numbers for each active user
  private userRecentPackets = new Map<string, Chunk[]>();

  /* A single silent packet, as an Ogg Opus file, which we can send periodically
   * as a ping */
  // prettier-ignore
  private static readonly SILENT_OGG_OPUS = Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x88, 0x23, 0x54, 0x9b, 0x00,
    0x00, 0x00, 0x00, 0x8e, 0xb3, 0x1d, 0x4a, 0x01, 0x13, 0x4f, 0x70, 0x75,
    0x73, 0x48, 0x65, 0x61, 0x64, 0x01, 0x01, 0x38, 0x01, 0x80, 0xbb, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x4f, 0x67, 0x67, 0x53, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x88, 0x23, 0x54, 0x9b, 0x01, 0x00,
    0x00, 0x00, 0x44, 0x96, 0xd6, 0x2f, 0x01, 0x0c, 0x4f, 0x70, 0x75, 0x73,
    0x54, 0x61, 0x67, 0x73, 0x00, 0x00, 0x00, 0x00, 0x4f, 0x67, 0x67, 0x53,
    0x00, 0x04, 0x18, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x88, 0x23,
    0x54, 0x9b, 0x02, 0x00, 0x00, 0x00, 0x3d, 0xa8, 0x9a, 0x9b, 0x01, 0x03,
    0xf8, 0xff, 0xfe]);

  constructor(
    @inject(TYPES.MultiTracksEncoder)
    private multiTracksEncoder: IMultiTracksEncoder
  ) {}

  private async joinVoiceChannel(): Promise<VoiceConnection> {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    return this.voiceChannel.join({ opusOnly: true });
  }

  stopRecording(): AccurateTime {
    if (!this.isRecording) throw new InvalidRecorderStateError("Not recording");
    clearInterval(this.pingProcess);
    this.voiceReceiver.off("data", this.adaptChunk);
    this.voiceChannel.leave();
    this.flushRemainingData();
    this.multiTracksEncoder.closeStreams();
    const startTime = this.startTime;
    this.resetToBlankState();
    this.isRecording = false;
    return startTime;
  }

  getStartTime(): AccurateTime {
    return this.startTime;
  }

  /**
   * As the audio recorder is a singleton, we need to clean all the variables up
   * before the next recording session.
   */
  private resetToBlankState(): void {
    this.voiceChannel = undefined;
    this.voiceConnection = undefined;
    this.voiceReceiver = undefined;
    this.startTime = undefined;
    this.users.clear();
    this.trackNo = 1;
    this.userTrackNos.clear();
    this.userPacketNos.clear();
    this.userPacketNos.clear();
  }

  private flushRemainingData() {
    for (const userId of this.userRecentPackets.keys()) {
      const user = this.users.get(userId);
      if (user === undefined) continue;
      const userTrackNo = this.userTrackNos.get(userId);
      const userRecents = this.userRecentPackets.get(userId);
      const packetNo = this.userPacketNos.get(user.id);
      const newPacketNo = this.multiTracksEncoder.flush(
        user,
        userTrackNo,
        userRecents,
        1,
        packetNo
      );
      this.userPacketNos.set(user.id, newPacketNo);
    }
  }

  /**
   * Periodically pings the voice connection to make sure it's alive
   */
  private heartbeat() {
    try {
      const oggStream = new Readable();
      this.voiceConnection.play(oggStream, { format: "ogg" });
      oggStream.push(AudioRecorder.SILENT_OGG_OPUS);
      oggStream.push(null);
    } catch (e) {
      console.error(e);
    }
  }

  async startRecording(voiceChannel: VoiceChannel): Promise<string> {
    if (this.isRecording)
      throw new InvalidRecorderStateError("Already recording");
    this.isRecording = true;
    const recordId = String(~~(Math.random() * 1000000000));
    this.startTime = hrtime();
    this.voiceChannel = voiceChannel;
    const guild = this.voiceChannel.guild;
    this.multiTracksEncoder.initStreams(recordId, {
      guild: `${guild.name}#${guild.id}`,
      channel: `${this.voiceChannel.name}`,
    });
    this.voiceConnection = await this.joinVoiceChannel();
    this.voiceConnection.play(resolve(__dirname, "../assets/welcome.opus"));
    this.voiceConnection.stopPlaying();
    this.voiceReceiver = this.voiceConnection.receive("opus");
    this.pingProcess = setInterval(
      () => this.heartbeat(),
      AudioRecorder.PING_INTERVAL
    );
    this.voiceReceiver.on("data", (c, u, t) => this.adaptChunk(c, u, t));
    return recordId;
  }

  /**
   * This process takes an Eris audio chunk and (seems to) converts it
   * to Discord.js format
   */
  private adaptChunk(chunk: Buffer, userId: string, timestamp: number) {
    const newChunk: Chunk = Buffer.from(chunk) as Chunk;
    newChunk.timestamp = timestamp;
    // If the userId is the bot itself or if it's somehow not defined,
    // abort recording this chunk
    if (!userId || userId === this.voiceChannel.client.user.id) return;
    const member = this.voiceChannel.guild.members.get(userId);
    // Also abort if member is not found
    if (!member) return;
    return this.onReceive(member.user, newChunk);
  }

  private onReceive(user: User, chunk: Chunk) {
    // By default, chunk.time is the receipt time
    const chunkTime = hrtime(this.startTime);
    // ~~ is a fancy truncate method
    // I don't understand what are 48000 and 20833.333 in this bit
    // 48000 is most certainly Discord audio sampling rate.
    chunk.time = chunkTime[0] * 48000 + ~~(chunkTime[1] / 20833.333);
    //TODO : FEEDBACK INTERVAL (glowing ring when speaking, not that important)
    let userTrackNo: number, userRecents: Chunk[];
    if (!this.users.has(user.id)) {
      this.users.set(user.id, user);
      userTrackNo = this.trackNo++;
      this.userTrackNos.set(user.id, userTrackNo);
      this.userPacketNos.set(user.id, 2);
      this.userRecentPackets.set(user.id, []);
      userRecents = [];
      this.multiTracksEncoder.registerNewTrackForUser(userTrackNo, user);
    } else {
      userTrackNo = this.userTrackNos.get(user.id);
      userRecents = this.userRecentPackets.get(user.id);
    }

    // Push the chunk into the list
    if (userRecents.length > 0) {
      const last = userRecents[userRecents.length - 1];
      userRecents.push(chunk);
      if (last.timestamp > chunk.timestamp) {
        // Received out of order!
        userRecents.sort((a, b) => {
          return a.timestamp - b.timestamp;
        });
        /* Note that due to this reordering, the granule position in
         * the output ogg file will actually be decreasing! This is
         * fine for us, as all ogg files are preprocessed by
         * oggstender, which corrects such discrepancies anyway. */
      }
    } else {
      userRecents.push(chunk);
    }
    // If the list is getting long, flush it
    if (userRecents.length > AudioRecorder.MAX_PACKETS_QUEUE_LENGTH) {
      const packetNo = this.userPacketNos.get(user.id);
      const newPacketNo = this.multiTracksEncoder.flush(
        user,
        userTrackNo,
        userRecents,
        1,
        packetNo
      );
      this.userPacketNos.set(user.id, newPacketNo);
    }
  }
}
