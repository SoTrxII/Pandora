import {Client, Message} from "eris";

export interface ICommand {
  /** What text triggers the commands**/
  trigger: string;
  run(m : Message, client: Client, args: (string|number)[]): Promise<void>;
}
