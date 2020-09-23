import { ICommand } from "../@types/command";
import { Client, Message, VoiceChannel } from "eris";
import { inject, injectable } from "inversify";
import { TYPES } from "../types";
import { IRecorderService } from "../@types/audio-recorder";

@injectable()
export class StopRecording implements ICommand {
    trigger = "end";
    constructor(
        @inject(TYPES.AudioRecorder) private audioRecorder: IRecorderService
    ) {}
    async run(
        m: Message,
        client: Client,
        args: (string | number)[]
    ): Promise<void> {
        this.audioRecorder.stopRecording();
    }
}
