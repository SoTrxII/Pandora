import EventEmitter = NodeJS.EventEmitter;

export interface IRedis extends EventEmitter {
  publish(channel: string, payload: Record<string, any>);

  subscribe(channel: string);
}
