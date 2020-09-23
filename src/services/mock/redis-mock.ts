import { IRedis } from "../../@types/redis";
import { EventEmitter } from "events";
import * as Redis from "ioredis";
import { injectable } from "inversify";

@injectable()
export class RedisMock extends EventEmitter implements IRedis {
  constructor(private options?: Redis.RedisOptions) {
    super();
  }
  publish(channel: string, payload: Record<string, any>) {}

  subscribe(channel: string) {}
}
