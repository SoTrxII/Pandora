# Pandora: Discord recorder

Pandora is a multi-track Discord voice recorder written in Typescript. This project should actually be considered as a
partial fork of [Yahweasel's Craig](https://github.com/Yahweasel/craig), as the recording process is pretty much the
same. Initially, I just needed to add some workflow changes to Craig, but plain Javascript wasn't that convenient to
work with, and I ended up refactoring the whole thing, cherry picking the functionalities I wanted.

Pandora can be regarded as a simplified version of Craig, intended to be used to record a single voice channel at a time.

This repository contains just the **recording** part, storing raw, unusable data. The cooking part, processing the data
into an audio file (or zip file with multiple tracks) can be found [here](https://github.com/SoTrxII/Pandora-cooking-server).
The two projects are separated to allow for some sort of "horizontal scaling". One cooking server can be used with
multiples bots (or multiple shards).
The number of cooking servers can then be increased along with the workload.

## Usage

There are two ways to use Pandora. Either by using commands (as any other Discord Bot), or by using a Redis PubSub
database to begin/end the recording. This second way of inputting commands is useful when an external process is
triggering the recording (such as another bot, or a web service). You can choose one way (or both) in the
[configuration section](#configuration).

### Commands

```bash
# The default command prefix is "."
# Start a recording session
.record

# End a recording session
.end
```

### Redis

In order to begin a recording session, you have to publish to the channel `startRecordingDiscord`. The [Redis Payload](#redis-message)
must contain the voice channel id to record in the data Object.
Example:

```ts
// Create a Redis publisher instance by any means
redis.publish("startRecordingDiscord", {
  hasError: false,
  data: { voiceChannelId: "<ID of the voice channel to record>" },
});
```

Once the recording started, an acknowledgment will be sent on the channel `recordingDiscordBegan`.

Likewise, to stop recording, simply publish to the channel `stopRecordingDiscord`.
Example:

```ts
// Create a Redis publisher instance by any means
redis.publish("stopRecordingDiscord", {
  hasError: false
});
```

The acknowledgment will be sent on the channel `recordingDiscordStopped`.

## Using Pandora and the cooking server together

Pandora's records are stored in the `rec` directory. The cooking server is also looking for
records in its own `rec` directory.
The simplest way to share these directories is by using a **Docker volume**.

Here is an example Docker-compose configuration using both projects Docker images :

```yaml
version: "3.7"
services:
  pandora:
    image: ghcr.io/sotrxii/pandora/pandora:latest
    container_name: pandora
    restart: always
    environment:
      - PANDORA_TOKEN=<DISCORD_TOKEN>
      - COMMAND_PREFIX=.
      - USE_REDIS_INTERFACE=0
      - USE_COMMAND_INTERFACE=1
      - REDIS_HOST=<REDIS_HOST>
    volumes:
      - pandora_recordings:/rec

  pandora-cooking-server:
    image: ghcr.io/sotrxii/pandora-cooking-server/pandora-cooking-server:latest
    container_name: pandora-cooking-server
    restart: always
    volumes:
      - pandora_recordings:/app/rec
volumes:
  pandora_recordings:
```

Of course many other ways exists.
 
## Installation

### Docker

Using Docker to run the bot is the recommended (and easy) way.

```bash
# Either pull the bot from the GitHub registry (requiring login for some reason)
docker login ghcr.io --username <YOUR_USERNAME>
# The image is 214Mb
docker pull ghcr.io/sotrxii/pandora/pandora:latest

# OR build it yourself (from the project's root)
docker build -t ghcr.io/sotrxii/pandora/pandora:latest
```

Once the image is pulled/built, run it:

```bash
docker run \
-e USE_COMMAND_INTERFACE="<1 or 0>" \
-e USE_REDIS_INTERFACE="<1 or 0>" \
-e COMMAND_PREFIX="." \
-e PANDORA_TOKEN="<DISCORD_BOT_TOKEN>" \
-e REDIS_HOST="<REDIS_DB_URL>" \
-it ghcr.io/sotrxii/pandora/pandora:latest
```

Refer to the [configuration](#configuration) for an explanation of the environment variables.
The bot should be up and running !

#### Why two Dockerfiles ?

The main Dockerfile is using Alpine Linux. Although I love Alpine, it gets a bit... dicey sometimes.
Although it _seems_ to run as expected, weird bugs can occurs, and the Ubuntu Docker variant, although
twice as large, is included to check if Alpine is playing tricks once again.

### Natively

Eris requires FFMPEG to be installed. Nodejs is of course also required.

```bash
npm install
# Transpile Typescript into Javascript
npm run build
```

Next, copy `.env.example` into `.env.` Refer to the [configuration step](#configuration) to fill the values in.

Finally, the fastest way to get the bot running is:

    npm run start:dev

However, this is not the best way to achieve it in a production environment.

A cleaner way would be to copy the **dist** directory into another location and only install the production dependencies.

```bash
# From the project's root
cp -r dist /away/pandora
cp .env /away/pandora/.env
cd /away/pandora

# We don't need all these devdependencies
npm install --only=prod

# Load the .env file into the bot process.
npm install dotenv-safe
node -r dotenv-safe/config main.js
```

With this, Pandora should be up and running !

## Configuration

Pandora uses 5 environment variables to control its runtime behaviour.

- COMMAND_PREFIX : This is the command prefix for the Discord commands. Use whatever you like.
- PANDORA_TOKEN : Standard discord bot token. You can see your apps in the [Discord developers portal](https://discord.com/developers/applications)
- USE_COMMAND_INTERFACE : Either "1" or "O" (Boolean). When enabled ("1") the bot will listen to Discord commands (<prefix>record, <prefix>end)
- USE_REDIS_INTERFACE : Either "1" or "O" (Boolean). When enabled ("1") the bot will attempt to connect to the REDIS_HOST and listen to the command.
- REDIS_HOST : Redis DB URL.

If USE_REDIS_INTERFACE is "0", set REDIS_HOST will default to localhost and can be omitted.
(Except if you're using **dotenv-safe**, it won't be happy if you omit a value. In this case, you can set REDIS_HOST to
whatever you want, it won't be used)

Both USE_COMMAND_INTERFACE and USE_COMMAND_INTERFACE can be enabled at the same time.
The audio recording module is in a Singleton scope. This means you could theoretically start a recording
via Redis and end it via a discord command (Why tho ?).

