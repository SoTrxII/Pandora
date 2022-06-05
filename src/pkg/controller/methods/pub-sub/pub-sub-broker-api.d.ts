/**
 * A Pub/Sub Client
 */
export interface IPubSubClientProxy {
  /**
   * Publish *data* to a topic *topic* on the pubsub component *pubsubname*
   * @param pubSubName
   * @param topic
   * @param data
   */
  publish(
    pubSubName: string,
    topic: string,
    data?: Record<string, unknown>
  ): Promise<boolean>;
}

/**
 * A Pub/Sub server
 */
export interface IPubSubServerProxy {
  /**
   * Subscribes to a topic *topic* on the pubsub component name *pubsubname*.
   * Calls *cb* when a message is received
   * @param pubSubName
   * @param topic
   * @param cb
   */
  subscribe(
    pubSubName: string,
    topic: string,
    cb: (data: any) => Promise<any>
  ): Promise<void>;

  /**
   * Starts the server
   */
  start(): Promise<void>;
}
