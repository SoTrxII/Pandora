import { DaprServer } from "@dapr/dapr";
import { injectable } from "inversify";
import { IPubSubServerProxy } from "./pub-sub-broker-api";

/**
 * Adapt the interface of a classic Dapr server into the required
 * interface.
 * This prevents having to use the whole Dapr server object in the
 * pubsub implementation
 */
@injectable()
export class DaprServerAdapter implements IPubSubServerProxy {
  private readonly server: DaprServer;

  constructor(private port = "50051", daprPort = "3500") {
    this.server = new DaprServer("127.0.0.1", port, "127.0.0.1", daprPort);
  }

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
