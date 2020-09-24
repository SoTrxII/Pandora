import { Container } from "inversify";
import { TYPES } from "./types";
import { IRecorderService } from "./@types/audio-recorder";
import { AudioRecorder } from "./services/audio-recorder";
import { OpusMultiTracksEncoder } from "./components/opus-multi-tracks-encoder";
import { IMultiTracksEncoder } from "./@types/multi-tracks-encoder";
import { Pandora } from "./Pandora";
import { ICommand } from "./@types/command";
import { ICommandMatcher } from "./@types/command-matcher";
import { CommandMatcher } from "./services/command-matcher";
import { StartRecording } from "./commands/start-recording";
import { StopRecording } from "./commands/stop-recording";
import { IRedis } from "./@types/redis";
import { RedisService } from "./components/redis";
import { RedisMock } from "./services/mock/redis-mock";
import { IRedisCommandBroker } from "./@types/redis-command-broker";
import { RedisCommandBroker } from "./services/redis-command-broker";

export const container = new Container();
container
  .bind<IMultiTracksEncoder>(TYPES.MultiTracksEncoder)
  .to(OpusMultiTracksEncoder);

container
  .bind<IRecorderService>(TYPES.AudioRecorder)
  .to(AudioRecorder)
  .inSingletonScope();

container.bind<ICommandMatcher>(TYPES.CommandMatcher).to(CommandMatcher);

// Only use the actual Redis implementation if it's actually required.
if (Boolean(process.env.USE_REDIS_INTERFACE)) {
  container.bind<IRedis>(TYPES.RedisService).toConstantValue(
    new RedisService({
      host: process.env.REDIS_HOST,
      lazyConnect: true,
    })
  );
} else {
  container.bind<IRedis>(TYPES.RedisService).toConstantValue(
    new RedisMock({
      host: process.env.REDIS_HOST,
      lazyConnect: true,
    })
  );
}
container
  .bind<IRedisCommandBroker>(TYPES.RedisCommandBroker)
  .to(RedisCommandBroker);

// Register all commands
container.bind<ICommand>(TYPES.Command).to(StartRecording);
container.bind<ICommand>(TYPES.Command).to(StopRecording);

container.bind<Pandora>(TYPES.Pandora).toConstantValue(
  new Pandora(
    container.get<ICommandMatcher>(TYPES.CommandMatcher),
    container.get<IRedisCommandBroker>(TYPES.RedisCommandBroker),
    {
      token: process.env.PANDORA_TOKEN,
      commandPrefix: process.env.COMMAND_PREFIX,
      useCommands: Boolean(Number(process.env.USE_COMMAND_INTERFACE)),
      useRedis: Boolean(Number(process.env.USE_REDIS_INTERFACE)),
    }
  )
);
