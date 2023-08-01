# Pandora: Discord recorder

![CI](https://github.com/SoTrxII/Pandora/actions/workflows/publish-coverage.yml/badge.svg)
[![codecov](https://codecov.io/gh/SoTrxII/Pandora/branch/master/graph/badge.svg?token=YI8X1HA6I7)](https://codecov.io/gh/SoTrxII/Pandora)
[![Docker Image Size](https://badgen.net/docker/size/sotrx/pandora/2.2.0?icon=docker&label=pandora)](https://hub.docker.com/r/sotrx/pandora/)

Pandora is a multi-track Discord voice recorder written in Typescript. This project should actually be considered as a
partial fork of [Yahweasel's Craig](https://github.com/CraigChat/craig), as the recording process is pretty much the
same. Initially, I just needed to add some workflow changes to Craig, but plain Javascript wasn't that convenient to
work with, and I ended up refactoring the whole thing, cherry-picking the functionalities I wanted.

Pandora can be regarded as a simplified version of Craig, intended to be used to record a single voice channel at a time.

This repository contains just the **recording** part, storing raw, unusable data. The cooking part, processing the data
into an audio file (or zip file with multiple tracks) can be found [here](https://github.com/SoTrxII/Pandora-cooking-server).
The two projects are separated to allow for some sort of "horizontal scaling". One cooking server can be used with
multiples bots (or multiple shards).
The number of cooking servers can then be increased along with the workload.

## Usage

There are three ways to use Pandora. Using text-based commands, interactions, or pub/sub messages
component to begin/end the recording. See [configuration section](#configuration).

### Commands

```bash
# You can configure the command prefix, see "configuration" section
# Start a recording session
<COMMAND_PREFIX>record

# End a recording session
<COMMAND_PREFIX>end
```

### Interactions

```bash
# Start a recording session
/record

# End a recording session
/end
```

### Pub/Sub

The pub/sub communication is using the [Request/Reply](https://www.enterpriseintegrationpatterns.com/RequestReply.html) pattern.
The pub/sub component itself can be any valid [Dapr pub/sub component](https://docs.dapr.io/reference/components-reference/supported-pubsub). See [configuration section](#configuration).

Message topics and payloads are as follow :
![Pub sub message exchange pattern](./resources/images/pubsub-messages-exchange.png)

#### Details

In order to begin a recording session, a message must be published to the topic `startRecordingDiscord`.
This message must contain the ID of the voice channel to record.

```ts
pubsub.publish("startRecordingDiscord", {
  voiceChannelId: "<ID of the voice channel to record>",
});
```

Once the recording started, an acknowledgment will be sent on the topic `startedRecordingDiscord`, echoing the sent payload.

Likewise, to stop recording, a message must be published to the topic `stopRecordingDiscord`. This message can be handled in two ways :

- If the voice channel id is specified in the payload, **only the instance of Pandora currently recording this specific voice channel will stop.**
- If the message has no payload, **all instances of pandora will stop recording**.

This allows for multiple bot instances recording multiple voices channels at the same time to be controlled by the same backing process.

The acknowledgment will be sent on the topic `stoppedRecordingDiscord`.

## Architecture

![Architecture](./resources/images/architecture.png)

Pandora uses 5 modules:

- The **audio recorder** itself, capturing RTP packets from Discord and storing the raw OGG packets in a set of text files.
- The **UnifiedController**, an event-based interface to handle how to start/end a recording. So far, the bot can be
  controlled either by text commands, interactions or pub/sub messages.
- An external **state store**. Catching errors from Discord voice connections has always been very tedious,
  this store saves the current recording state and leaves the bot reboot to get a clean state.
- A **logger**. Plain text logging is used in development, [ECS format](https://www.elastic.co/guide/en/ecs/current/index.html) is used in production.
- An **Object Store**. This is to allow for the bot itself to scale, as it removes the need for a shared volume between it and the cooking server

## Configuration

```dotenv
# Mandatory variables
# Discord bot token
PANDORA_TOKEN=
# Prefix for text-based command
COMMAND_PREFIX=
# Dapr component name for state storage
STORE_NAME=

# Optional variables
If defined: Slash commands aren't published
DISABLE_INTERACTIONS=
# Dapr callback port
DAPR_SERVER_PORT=
# Dapr Http port. 
DAPR_HTTP_PORT=

# Variables for "complete" deployment
# Dapr component name for object storage
OBJECT_STORE_NAME=
# Dapr component name for pub/sub support
PUBSUB_NAME=

```

#### Dapr

[Dapr](https://github.com/dapr/dapr) is used a decoupling solution. Dapr uses **components** to define the implementation
of some part of the application at runtime using a [sidecar architecture.](https://medium.com/nerd-for-tech/microservice-design-pattern-sidecar-sidekick-pattern-dbcea9bed783)

These components are YAML files mounted in the sidecar as a volume. You can find a sample deployment
using these components in the [sample implementation](#minimal-deployment) section.

## Minimal deployment

This project is meant to be modular.
The most basic setup offers the following features :
- Record a Discord channel, with a start command and an end command
- Retrieve the processed recording using the cooking server

To achieve this, we need three components :
- Pandora, the bot itself
- The "cooking server", which processes the audio files
- A state store (Redis in the example). This is for resiliency.

To deploy this setup, you can use the following commands :
```shell
# Copy the sample dotenv file, don't forget to replace all mandatory variables
cp .env.example samples/minimal/.env
cd samples/minimal 
docker compose up
```

If you start a recording with either a slash command or a text command, you'll get the recording ID.

```shell
Recording started with id <ID>
```

Once you've finished recording, you can retrieve the audio files using the open port on the cooking server.

Open a browser and type :
```
localhost:3004/<ID>
```

to retrieve the recording in the default format (OGG, all users mixed as a single track)

#### Going further 

This deployment is simple, but lacks two features:
- Starting and stopping a recording with Pub/Sub
- Use an external object storage solution to store the recordings. Using a volume is not ideal for scaling.

Although not mandatory, these two features are somewhat the reason Pandora exists, as I use the bot as part of a larger system.

This deployment can be found in the samples/complete directory.