import { AccurateTime, Chunk, IRecorderService } from "./audio-recorder-api";
import { User, VoiceChannel } from "discord.js";
import {
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
  EndBehaviorType,
  getVoiceConnection,
} from "@discordjs/voice";
import { hrtime } from "process";
import { IMultiTracksEncoder } from "../../internal/opus-encoder/multi-tracks-encoder";
import { TYPES } from "../../types";
import { inject, injectable } from "inversify";
import { Readable } from "stream";
import { resolve } from "path";
import { access } from "fs/promises";
import * as EventEmitter from "events";
import { constants } from "fs";
import {
  createAudioPlayer,
  createAudioResource,
  NoSubscriberBehavior,
} from "@discordjs/voice";
import Timeout = NodeJS.Timeout;

export class InvalidRecorderStateError extends Error {}

@injectable()
export class AudioRecorder extends EventEmitter implements IRecorderService {
  /** Path to a sample sound file */
  private static readonly SAMPLE_SOUND_PATH = resolve(
    __dirname,
    "../../assets/welcome.opus"
  );

  private static readonly MAX_PACKETS_QUEUE_LENGTH = 16;

  // Ping period in ms
  private static readonly PING_INTERVAL = 3000;
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
  private isRecording = false;
  private voiceChannel: VoiceChannel;
  private voiceConnection: VoiceConnection;
  private pingProcess: Timeout;
  private startTime: AccurateTime;
  private audioSubscriptions: Map<string, any> = new Map();
  // Active users, by ID
  private users = new Map<string, User>();
  // Our current track number
  private trackNo = 1;
  // Track numbers for each active user
  private userTrackNos = new Map<string, number>();
  // Packet numbers for each active user
  private userPacketNos = new Map<string, number>();

  /* A single silent packet, as an Ogg Opus file, which we can send periodically
   * as a ping */
  // Packet numbers for each active user
  private userRecentPackets = new Map<string, Chunk[]>();

  constructor(
    @inject(TYPES.MultiTracksEncoder)
    private multiTracksEncoder: IMultiTracksEncoder
  ) {
    super();
  }

  stopRecording(): void {
    if (!this.isRecording) throw new InvalidRecorderStateError("Not recording");
    clearInterval(this.pingProcess);
    // Unsubscribe from all audio streams
    this.audioSubscriptions.forEach((stream) => stream.destroy());
    this.audioSubscriptions.clear();
    // Disconnect from voice
    if (this.voiceConnection) {
      this.voiceConnection.destroy();
    }
    this.flushRemainingData();
    this.multiTracksEncoder.closeStreams();
    this.resetToBlankState();
    this.isRecording = false;
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
      channel: this.voiceChannel.name,
    });
    this.voiceConnection = await this.setupVoiceConnection();

    // Subscribe to speaking events to capture audio from users
    this.voiceConnection.receiver.speaking.on("start", (userId) => {
      this.subscribeToUser(userId);
    });

    this.voiceConnection.on("error", (err) => this.emit("error", err));
    return recordId;
  }

  /**
   * Joins a voice channel and sets up audio player.
   * @throws an error if connection fails
   */
  async setupVoiceConnection(): Promise<VoiceConnection> {
    const connection = joinVoiceChannel({
      channelId: this.voiceChannel.id,
      guildId: this.voiceChannel.guild.id,
      adapterCreator: this.voiceChannel.guild.voiceAdapterCreator as any,
      selfDeaf: false,
      selfMute: false,
    });

    // Wait for the connection to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Voice connection timeout"));
      }, 10000);

      connection.on(VoiceConnectionStatus.Ready, () => {
        clearTimeout(timeout);
        resolve();
      });

      connection.on(VoiceConnectionStatus.Disconnected, () => {
        clearTimeout(timeout);
        reject(new Error("Voice connection failed"));
      });
    });

    // Play welcome sound if available
    try {
      await access(AudioRecorder.SAMPLE_SOUND_PATH, constants.F_OK);
      const player = createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Play },
      });
      const resource = createAudioResource(AudioRecorder.SAMPLE_SOUND_PATH);
      connection.subscribe(player);
      player.play(resource);
      // Stop after a brief moment
      setTimeout(() => player.stop(), 100);
    } catch (e) {
      // Welcome sound optional, continue anyway
    }

    return connection;
  }

  /**
   * As the audio recorder is a singleton, we need to clean all the variables up
   * before the next recording session.
   */
  private resetToBlankState(): void {
    this.voiceChannel = undefined;
    this.voiceConnection = undefined;
    this.audioSubscriptions.clear();
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
        userTrackNo,
        userRecents,
        1,
        packetNo
      );
      this.userPacketNos.set(user.id, newPacketNo);
    }
  }

  /**
   * Subscribe to a user's audio stream
   */
  private subscribeToUser(userId: string): void {
    if (this.audioSubscriptions.has(userId)) return;

    const audioStream = this.voiceConnection.receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.Manual,
      },
    });

    let timestamp = 0;
    audioStream.on("data", (chunk: Buffer) => {
      this.adaptChunk(chunk, userId, timestamp);
      timestamp += 960; // 20ms at 48kHz
    });

    this.audioSubscriptions.set(userId, audioStream);
  }

  /**
   * This process takes an audio chunk and processes it
   */
  adaptChunk(chunk: Buffer, userId: string, timestamp: number) {
    const newChunk: Chunk = Buffer.from(chunk) as unknown as Chunk;
    newChunk.timestamp = timestamp;
    // If the userId is the bot itself or if it's somehow not defined,
    // abort recording this chunk
    const botId = this.voiceChannel?.client?.user?.id;
    if (!userId || userId === botId) return;

    const member = this.voiceChannel?.guild?.members?.cache.get(userId);
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
        userTrackNo,
        userRecents,
        1,
        packetNo
      );
      this.userPacketNos.set(user.id, newPacketNo);
    }
  }

  getRecordingsDirectory(): string {
    return this.multiTracksEncoder.getRecordingsDirectory();
  }
}
