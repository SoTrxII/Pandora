import { injectable } from "inversify";
import { IRedis } from "../@types/redis";
import * as Redis from "ioredis";
import { RedisOptions } from "ioredis";
import { EventEmitter } from "events";
import { promisify } from "util";

@injectable()
export class RedisService extends EventEmitter implements IRedis {
  // Setting infinite retries by default
  private static readonly DEFAULT_OPTIONS: RedisOptions = {
    maxRetriesPerRequest: null,
  };
  //We actually need two separate client to pub and sub
  private subscriber: Redis.Redis;
  private publisher: Redis.Redis;
  private connected = true;
  private options: RedisOptions;

  constructor(options?: Redis.RedisOptions) {
    super();
    this.options = Object.assign(RedisService.DEFAULT_OPTIONS, options);
    this.subscriber = new Redis(this.options);
    this.publisher = new Redis(this.options);
    // Message mirroring
    this.subscriber.on("message", (channel, message) => {
      // Try to interpret the message in JSON, fall back to string
      // if it can't be parsed

      this.emit("message", [channel, message]);
    });
    //
    this.subscriber.on("error", (err) => {
      if (this.connected) {
        console.error(
          "Could not connect to Redis Db, exponentially backing off"
        );
        this.connected = false;
      }

      console.error(err.message);
    });
  }

  publish(channel: string, payload: Record<string, any>) {
    this.publisher.publish(channel, JSON.stringify(payload));
  }

  async subscribe(channel: string) {
    const subProm = promisify(this.subscriber.subscribe).bind(this.subscriber);
    try {
      await subProm(channel);
    } catch (e) {
      console.error(e);
    }
  }
}
