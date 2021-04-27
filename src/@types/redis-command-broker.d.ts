import { Client } from "eris";

export interface IRedisCommandBroker {
  startListening(client: Client): void;
  sendRecordingBeganEvent(payload?: RedisMessage): void;
  sendRecordingStoppedEvent(payload?: RedisMessage): void;
  sendRecordingErrorEvent(payload?: RedisMessage): void;
}

export interface RedisMessage {
  hasError: boolean;
  data: Record<string, any>;
}
