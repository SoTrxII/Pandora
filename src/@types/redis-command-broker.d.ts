import { Client } from "eris";

export interface IRedisCommandBroker {
  startListening(client: Client): void;
}

export interface RedisMessage {
  hasError: boolean;
  data: Record<string, any>;
}
