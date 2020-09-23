# Pandora: Discord recorder

Pandora is a multi-track Discord voice recorder written in Typescript. This project should actually be considered as a kind-of a fork of
[Yahweasel's Craig](https://github.com/Yahweasel/craig) as the recording process is itself pretty much the same, and the
"cooking" process is just a straight copy. Initially, I just needed to add some workflow changes to Craig, but plain
Javascript wasn't that easy to work with, and I ended up refactoring the whole thing, cherry picking
the functionalities I wanted.

Pandora can be regarded as a simplified version of Craig, intended to be used to record a single voice channel at a time.

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

#### Why not Alpine ? 
Alpine is lacking some unix tools and would require a custom ffmpeg build to run all the possible configuration of the
cooking process. The extra gain in space is not worth going through that.  

### Natively
Running the bot natively is a bit trickier, but not that difficult. Using Docker is a better way still. 

#### Requirements

The requirements are the same as Craig's. 
You'll need all these installed : 
+ ffmpeg ( http://ffmpeg.org/ ) compiled with libopus support
+ flac ( https://xiph.org/flac/ )
+ oggenc ( https://xiph.org/vorbis/ )
+ opusenc ( http://opus-codec.org/ )
+ fdkaac ( https://github.com/nu774/fdkaac )
+ zip and unzip ( http://infozip.org/ )

Quick install command: 
```bash
# Debian-based distros
sudo apt install ffmpeg flac vorbis-tools zip fdkaac
# Red-Hat based distros (Yes there is really an extra hyphen)
sudo dnf install ffmpeg flac vorbis-tools zip fdk-aac
# Windows
(Use Docker, the cooking script is a pure Bash script, you won't be able to run it anyway) 
```

Next, all the cooking scripts needs to be compiled. Beware, you will need GCC/make/autoconf
(and maybe more depending on the distro).
```bash
# From the project's root
cd cook
for i in \*.c; do gcc -O3 -o ${i%.c} $i; done
cd windows; make
cd macosx; make
```

#### Direct dependencies and transpilation

```bash
# nodejs and npm must be installed
npm install
# Transpile Typescript into Javascript
npm run build
```

### Running the Bot

Copy .env.example into .env. Refer to the [configuration step](#configuration) to fill the values. 
When this is done, the quickest way to get the bot running is to run:
   
    npm run start:dev
    
However, this is not the best way to run it in a production environment. 

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







