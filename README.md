# Pandora: Discord recorder

Pandora is a multi-track Discord voice recorder written in Typescript. This project should actually be considered as a kind-of a fork of
[Yahweasel's Craig](https://github.com/Yahweasel/craig) as the recording process is itself pretty much the same, and the
"cooking" process is just a straight copy. Initially, I just needed to add some workflow changes to Pandora, but plain
Javascript wasn't that easy to work with, and I ended up refactoring the whole thing, cherry picking
the functionalities I wanted.

Pandora can be regarded as a simplified version of Craig, intended to be used to record a single voice channel at a time.

This is just the **recording** part, storing raw data. The cooking part, processing the data into an audio file 
(or zip file with multiple tracks) can be found [here](cookingLol). The two projects are separated to allow for 
some sort of "horizontal scaling". One cooking server can be used with multiples bots (or multiple shards). The number
of cooking server required can then be increased along with the load (if you're into that).

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
    hasError : false,
    data : { voiceChannelId : "<ID of the voice channel to record>"},    
})
```
Once the recording started, an acknowledgment will be sent on the channel `recordingDiscordBegan`.

Likewise, to stop recording, simply publish to the channel `stopRecordingDiscord`.
 Example: 
 ```ts
 // Create a Redis publisher instance by any means
 redis.publish("stopRecordingDiscord", {
     hasError : false,
     data : { voiceChannelId : "<ID of the voice channel to record>"},    
 })
 ```
The acknowledgment will be sent on the channel `recordingDiscordStopped`.

## Installation

### Docker
Using Docker to run the bot is the recommended (and easy) way.
```bash
# Either pull the bot from the GitHub registry (requiring login for some reason)
docker login docker.pkg.github.com --username <YOUR_USERNAME>
# The image is 214Mb 
docker pull docker.pkg.github.com/sotrx/pandora/pandora:latest

# OR build it yourself (from the project's root)
docker build -t docker.pkg.github.com/sotrx/pandora/pandora:latest
```
Once the image is pulled/built, run it:

```bash
docker run \
-e USE_COMMAND_INTERFACE="<1 or 0>" \
-e USE_REDIS_INTERFACE="<1 or 0>" \
-e COMMAND_PREFX="." \
-e PANDORA_TOKEN="<DISCORD_BOT_TOKEN>" \
-e REDIS_HOST="<REDIS_DB_URL>" \
-it docker.pkg.github.com/sotrx/pandora/pandora:latest
```
Refer to the [configuration](#configuration) for an explanation of the environment variables.
The bot should be up and running !

#### Why two Dockerfiles ? 
The main Dockerfile is using Alpine Linux. Although I love Alpine, it gets a bit dicey when using it with audio/video
(especially FFMPEG). Although it *seems* to run as expected, weird bugs can occurs, and the Ubuntu Docker variant, although
twice as large, is included to check if Alpine is playing tricks on us. 

### Natively
Running the bot natively is a bit trickier, but not that difficult. 

#### Direct dependencies and transpilation

```bash
# nodejs and npm must of course be installed
npm install
# Transpile Typescript into Javascript
npm run build
```

### Running the Bot

Copy .env.example into .env. Refer to the [configuration step](#configuration) to fill the values. 
When this is done, the fastest way to get the bot running is:
   
    npm run start:dev
    
However, this is not the best way to do it in a production environment. 

A cleaner way would be to copy the **dist** directory, containing the transpiled Javascript, into another location and
only install the production dependencies (This is what the Dockerfile do).
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

If you've read all this, congratulations. Now, seriously, just use Docker. 

## Configuration

Pandora uses 5 environment variables to control its runtime behaviour.

+ COMMAND_PREFX : This is the command prefix for the Discord commands. Use whatever you like.
+ PANDORA_TOKEN : Standard discord bot token. You can see your apps in the [Discord developers portal](https://discord.com/developers/applications)
+ USE_COMMAND_INTERFACE : Either "1" or "O" (Boolean). When enabled ("1") the bot will listen to Discord commands (<prefix>record, <prefix>end)
+ USE_REDIS_INTERFACE : Either "1" or "O" (Boolean). When enabled ("1") the bot will attempt to connect to the REDIS_HOST and listen to the command.
+ REDIS_HOST : Redis DB URL.

If USE_REDIS_INTERFACE is "0", REDIS_HOST is defaulting to localhost and can be not provided.
Both USE_COMMAND_INTERFACE and USE_COMMAND_INTERFACE can be enabled at the same time. The audio recording process is a Singleton. 
You could start a recording via Redis and end it via a discord command (Why tho ?).

## Roadmap

+ Replace node-opus by discordjs/opus
+ Remove Eris library modifications.




