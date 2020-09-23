import { Container } from "inversify";
import { TYPES } from "./types";
import { IRecorderService } from "./@types/audio-recorder";
import { AudioRecorder } from "./services/audio-recorder";
import { OpusMultiTracksEncoder } from "./components/opus-multi-tracks-encoder";
import { IMultiTracksEncoder } from "./@types/multi-tracks-encoder";
import { Craig } from "./craig";
import { ICommand } from "./@types/command";
import { ICommandMatcher } from "./@types/command-matcher";
import { CommandMatcher } from "./services/command-matcher";
import { StartRecording } from "./commands/start-recording";
import { StopRecording } from "./commands/stop-recording";

export const container = new Container();
container
  .bind<IMultiTracksEncoder>(TYPES.MultiTracksEncoder)
  .to(OpusMultiTracksEncoder);

container
  .bind<IRecorderService>(TYPES.AudioRecorder)
  .to(AudioRecorder)
  .inSingletonScope();

container.bind<ICommandMatcher>(TYPES.CommandMatcher).to(CommandMatcher);

// Register all commands
container.bind<ICommand>(TYPES.Command).to(StartRecording);
container.bind<ICommand>(TYPES.Command).to(StopRecording);

container.bind<Craig>(TYPES.Craig).toConstantValue(
  new Craig(container.get<ICommandMatcher>(TYPES.CommandMatcher), {
    token: process.env.CRAIG_TOKEN,
    commandPrefix: process.env.COMMAND_PREFIX,
  })
);
