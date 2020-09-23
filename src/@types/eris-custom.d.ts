import {
  Message,
  PrivateChannel,
  TextChannel,
  MessageContent,
  MessageFile,
  Client,
  Guild,
  Member,
  VoiceConnection,
  VoiceChannel,
  Role,
  User,
} from "eris";
declare module "eris" {
  interface PrivateChannel {
    send(
      content: MessageContent,
      file?: MessageFile | MessageFile[]
    ): Promise<Message>;
  }
  interface TextChannel {
    send(
      content: MessageContent,
      file?: MessageFile | MessageFile[]
    ): Promise<Message>;
  }
  interface Client {
    login(): Promise<void>;
  }
  interface Guild {
    fetchMember(id: string): Promise<Member>;
    voiceConnection: VoiceConnection;
  }
  interface Member {
    voiceChannel: VoiceChannel;
  }
  interface Message {
    guild: Guild;
    reply(content: string): Promise<string>;
  }
  interface Role {
    members: Member[];
  }
  interface User {
    send(content: string): Promise<void>;
  }
  interface VoiceChannel {
    joinable: boolean;
    members: Member[];
  }
  interface VoiceConnection {
    channel: VoiceChannel;
  }
}
