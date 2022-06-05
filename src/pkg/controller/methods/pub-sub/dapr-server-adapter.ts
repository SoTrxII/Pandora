import { IPubSubServerProxy } from "./pub-sub-broker-api";
import { DaprServer } from "dapr-client";
import { injectable } from "inversify";

/**
 * Adapt the interface of a classic Dapr server into the required
 * interface.
 * This prevents having to use the whole Dapr server object in the
 * pubsub implementation
 */
@injectable()
export class DaprServerAdapter implements IPubSubServerProxy {
  constructor(private server = new DaprServer("127.0.0.1", "50051")) {}

  async start(): Promise<void> {
    await this.server.start();
  }

  async subscribe(
    pubSubName: string,
    topic: string,
    cb: (data: any) => Promise<any>
  ): Promise<void> {
    await this.server.pubsub.subscribe(pubSubName, topic, cb);
  }
}
