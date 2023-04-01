import { Container } from "inversify";
import { TYPES } from "./types";
import { IRecorderService } from "./pkg/audio-recorder/audio-recorder-api";
import { AudioRecorder } from "./pkg/audio-recorder/audio-recorder";
import { OpusMultiTracksEncoder } from "./internal/opus-encoder/opus-multi-tracks-encoder";
import { IMultiTracksEncoder } from "./internal/opus-encoder/multi-tracks-encoder";
import { Pandora } from "./Pandora";
import {
  IController,
  IUnifiedBotController,
} from "./pkg/controller/bot-control.types";
import { PubSubBroker } from "./pkg/controller/methods/pub-sub/pub-sub-broker";
import { CommandBroker } from "./pkg/controller/methods/commands/command-broker";
import { BotController } from "./pkg/controller/bot-controller";
import { DaprClient } from "@dapr/dapr";
import {
  IRecordingStore,
  IStoreProxy,
} from "./pkg/state-store/state-store.api";
import { ExternalStore } from "./pkg/state-store/external-store";
import * as Eris from "eris";
import { IBotImpl } from "./pkg/controller/methods/commands/command-broker-external-api";
import { ILogger } from "./pkg/logger/logger-api";
import { ecsLogger } from "./pkg/logger/logger-ecs";
import { plainTextLogger } from "./pkg/logger/logger-plain-text";
import {
  IPubSubClientProxy,
  IPubSubServerProxy,
} from "./pkg/controller/methods/pub-sub/pub-sub-broker-api";
import { DaprServerAdapter } from "./pkg/controller/methods/pub-sub/dapr-server-adapter";
import { InteractionBroker } from "./pkg/controller/methods/interactions/interaction-broker";
import { Client, Constants } from "eris";
import {
  IObjectStore,
  IObjectStoreProxy,
} from "./pkg/object-store/objet-store-api";
import { DaprObjectStorageAdapter } from "./pkg/object-store/dapr-object-storage-adapter";
import { ExternalObjectStore } from "./pkg/object-store/external-objet-store";

export const container = new Container();

/**
 * Logger
 * Using ECS format in production to allows for an ELK stack to parse them
 * Using plain text in dev to still have a human-readable format
 */
const logger =
  process.env.NODE_ENV === "production" ? ecsLogger : plainTextLogger;
container.bind<ILogger>(TYPES.Logger).toConstantValue(logger);
container
  .bind<IMultiTracksEncoder>(TYPES.MultiTracksEncoder)
  .to(OpusMultiTracksEncoder);

const DAPR_SERVER_PORT = process.env.DAPR_SERVER_PORT ?? "50053";
const DAPR_HTTP_PORT = process.env.DAPR_HTTP_PORT ?? "3503";
console.debug(
  `Dapr params : http port -> "${DAPR_HTTP_PORT}", server port -> "${DAPR_SERVER_PORT}"`
);
container
  .bind<IRecorderService>(TYPES.AudioRecorder)
  .to(AudioRecorder)
  .inSingletonScope();

/** State store */
container
  .bind(TYPES.StoreProxy)
  .toConstantValue(new DaprClient("localhost", DAPR_HTTP_PORT).state);
container
  .bind(TYPES.StateStore)
  .toConstantValue(
    new ExternalStore(
      container.get<IStoreProxy>(TYPES.StoreProxy),
      process.env.STORE_NAME
    )
  );

/** Object Store */
const objComponent = process.env?.OBJECT_STORE_NAME;
// Only register the Object Store component of the Dapr component name was supplied
if (objComponent) {
  container
    .bind<IObjectStoreProxy>(TYPES.ObjectStoreProxy)
    .toConstantValue(
      new DaprObjectStorageAdapter(
        new DaprClient("localhost", DAPR_HTTP_PORT).binding,
        process.env.OBJECT_STORE_NAME
      )
    );
  container.bind<IObjectStore>(TYPES.ObjectStore).to(ExternalObjectStore);
}

/** PubSub Interface */
// Only register the Pub/Sub broker if the dapr component name was provided
const PSComponent = process.env?.PUBSUB_NAME;

if (PSComponent) {
  container
    .bind(TYPES.PubSubClientProxy)
    .toConstantValue(new DaprClient("localhost", DAPR_HTTP_PORT).pubsub);
  container
    .bind(TYPES.PubSubServerProxy)
    .toConstantValue(new DaprServerAdapter(DAPR_SERVER_PORT, DAPR_HTTP_PORT));
  container
    .bind<IController>(TYPES.Controller)
    .toConstantValue(
      new PubSubBroker(
        container.get<IPubSubClientProxy>(TYPES.PubSubClientProxy),
        container.get<IPubSubServerProxy>(TYPES.PubSubServerProxy),
        process.env.PUBSUB_NAME
      )
    );
}

/** Eris client */
container.bind(TYPES.ClientProvider).toProvider((context) => {
  return () => {
    return new Promise((res, rej) => {
      const client = new Eris.Client(process.env.PANDORA_TOKEN);
      if (client.ready) res(client);
      client.connect();
      client.on("ready", () => {
        console.log("Up and running");
        res(client);
      });
      setTimeout(() => {
        if (client.ready) res(client);
        else rej();
      }, 20000);
    });
  };
});

const commandPrefix = process.env?.COMMAND_PREFIX;
// Only use the command interface of the command prefix was provided
if (commandPrefix) {
  /** Command Interface */
  container.bind<IController>(TYPES.Controller).toDynamicValue((context) => {
    return new CommandBroker(
      process.env.COMMAND_PREFIX,
      context.container.get<() => Promise<IBotImpl>>(TYPES.ClientProvider),
      {
        start: "record",
        end: "end",
      }
    );
  });
}

if (process.env?.DISABLE_INTERACTION === undefined) {
  console.log("Enabling interactions");
  /** Interaction Interface */
  container.bind<IController>(TYPES.Controller).toDynamicValue((context) => {
    return new InteractionBroker(
      context.container.get<() => Promise<Client>>(TYPES.ClientProvider),
      [
        {
          name: "record",
          description: "Record the voice channel the user is in",
          type: Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
        {
          name: "end",
          description: "End a previously started recording",
          type: Constants.ApplicationCommandTypes.CHAT_INPUT,
        },
      ]
    );
  });
}

container
  .bind<IUnifiedBotController>(TYPES.UnifiedController)
  .to(BotController);

container
  .bind(TYPES.Pandora)
  .toConstantValue(
    new Pandora(
      container.get<() => Promise<Eris.Client>>(TYPES.ClientProvider),
      container.get<IUnifiedBotController>(TYPES.UnifiedController),
      container.get<IRecorderService>(TYPES.AudioRecorder),
      container.get<IRecordingStore>(TYPES.StateStore),
      container.get<IObjectStore>(TYPES.ObjectStore),
      container.get<ILogger>(TYPES.Logger)
    )
  );
