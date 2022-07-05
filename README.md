# Pandora: Discord recorder

![CI](https://github.com/SoTrxII/Pandora/actions/workflows/publish-coverage.yml/badge.svg)
[![codecov](https://codecov.io/gh/SoTrxII/Pandora/branch/master/graph/badge.svg?token=YI8X1HA6I7)](https://codecov.io/gh/SoTrxII/roll20-scrapper)
[![Docker Image Size](https://badgen.net/docker/size/sotrx/pandora/2.0.0?icon=docker&label=pandora)](https://hub.docker.com/r/sotrx/pandora/)

Pandora is a multi-track Discord voice recorder written in Typescript. This project should actually be considered as a
partial fork of [Yahweasel's Craig](https://github.com/Yahweasel/craig), as the recording process is pretty much the
same. Initially, I just needed to add some workflow changes to Craig, but plain Javascript wasn't that convenient to
work with, and I ended up refactoring the whole thing, cherry-picking the functionalities I wanted.

Pandora can be regarded as a simplified version of Craig, intended to be used to record a single voice channel at a time.

This repository contains just the **recording** part, storing raw, unusable data. The cooking part, processing the data
into an audio file (or zip file with multiple tracks) can be found [here](https://github.com/SoTrxII/Pandora-cooking-server).
The two projects are separated to allow for some sort of "horizontal scaling". One cooking server can be used with
multiples bots (or multiple shards).
The number of cooking servers can then be increased along with the workload.

## Usage

```shell
dapr init
```

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
In order to begin a recording session, you have to publish to the topic `startRecordingDiscord`. The [Redis Payload](#redis-message)
must contain the voice channel id to record.
The pub/sub component itself can be any valid [Dapr pub/sub component](https://docs.dapr.io/reference/components-reference/supported-pubsub). See [configuration section](#configuration).
Example:

```ts
pubsub.publish("startRecordingDiscord", {
  voiceChannelId: "<ID of the voice channel to record>",
});
```

Once the recording started, an acknowledgment will be sent on the topic `recordingDiscordBegan`.

Likewise, to stop recording, simply publish to the topic `stopRecordingDiscord`.
Example:

```ts
pubsub.publish("stopRecordingDiscord");
```

The acknowledgment will be sent on the topic `recordingDiscordStopped`.

## Architecture

![Architecture](./resources/images/architecture.png)

Pandora uses 4 modules:

- The **audio recorder** itself, capturing RTP packets from Discord and storing the raw OGG packets in a set of text files.
- The **UnifiedController**, an event-based interface to handle how to start/end a recording. So far, the bot can be
  controlled either by text commands, interactions or pub/sub messages.
- An external **state store**. Catching errors from Discord voice connections has always been very tedious,
  this store saves the current recording state and leaves the bot reboot to get a clean state.
- A **logger**. Plain text loggin is used in development, [ECS format](https://www.elastic.co/guide/en/ecs/current/index.html) is used in production.

## Configuration

Pandora uses 4 environment variables to control its runtime behaviour.

```dotenv
# Discord bot token
PANDORA_TOKEN=<DISCORD_TOKEN>
# Prefix for text-based command
COMMAND_PREFIX=<COMMAND_PREFIX>
# Dapr components names
PUBSUB_NAME=<DAPR_COMPONENT_PUBSUB>
STORE_NAME=<DAPR_COMPONENT_STORE>
```

#### Dapr

[Dapr](https://github.com/dapr/dapr) is used a decoupling solution. Dapr uses **components** to define the implementation
of some part of the application at runtime using a [sidecar architecture.](https://medium.com/nerd-for-tech/microservice-design-pattern-sidecar-sidekick-pattern-dbcea9bed783)

Pandora uses two Dapr components, a [pub/sub component](https://docs.dapr.io/operations/components/setup-pubsub/) and a [state store component](https://docs.dapr.io/reference/components-reference/supported-state-stores/).

These components are YAML files mounted in the sidecar as a volume. You can find a sample deployment
using these components in the [sample implementation](#full-discord-recording-implementation) section.

```yaml
# A sample pubsub component using Redis
# as a backend
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: pubsub
spec:
  type: pubsub.redis
  version: v1
  metadata:
    - name: redisHost
      value: redis:6379
    - name: redisPassword
      value: ""
```

```yaml
# A sample statestore component using Redis
# as a backend
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: statestore
spec:
  type: state.redis
  version: v1
  metadata:
    - name: redisHost
      value: redis:6379
    - name: redisPassword
      value: ""
```

## Full discord recording implementation

Pandora's records are stored in the `rec` directory. The cooking server is also looking for
records in its own `rec` directory.
The simplest way to share these directories is by using a **volume**.

Here is an example Docker-compose configuration using both projects Docker images :

```yaml
version: "3.7"
services:
  # Record a voice channel into raw files
  pandora:
    image: sotrx/pandora:2.0.0
    container_name: pandora
    restart: always
    environment:
      # Discord bot token
      - PANDORA_TOKEN=<DISCORD_TOKEN>
      # Prefix for text-based command
      - COMMAND_PREFIX=<COMMAND_PREFIX>
      # Dapr components names
      - PUBSUB_NAME=<DAPR_COMPONENT_PUBSUB>
      - STORE_NAME=<DAPR_COMPONENT_STORE>
    volumes:
      - pandora_recordings:/rec
    networks:
      - discord_recordings
  # Dapr sidecar, defining runtime implementations
  pandora-dapr:
    image: "daprio/daprd:edge"
    command:
      [
        "./daprd",
        "-app-id",
        "pandora",
        "-app-port",
        "50051",
        "-dapr-grpc-port",
        "50002",
        "-components-path",
        "/components",
      ]
    volumes:
      - "./components/:/components"
    depends_on:
      - pandora
    network_mode: "service:pandora"

  # Converts the raw files into audio files
  pandora-cooking-server:
    # This one hasn't been uploaded on dockerhub yet
    image: ghcr.io/sotrxii/pandora-cooking-server/pandora-cooking-server:latest
    container_name: pandora-cooking-server
    restart: always
    volumes:
      - pandora_recordings:/app/rec
    networks:
      - discord_recordings

  # Pub/Sub broker && state store
  redis:
    image: "redis:alpine"
    networks:
      - discord_recordings

# Storing the recordings
volumes:
  pandora_recordings:

# Default docker network doesn't always provide name resolution
# so we create a new one
networks:
  discord_recordings:
```
