declare module "node-opus" {
  import { Transform } from "stream";

  class OpusEncoder extends Transform {
    constructor(
      rate?: 8000 | 12000 | 16000 | 24000 | 48000,
      channels?: number,
      frameSize?: number
    );

    decode(pcmBuffer: Buffer, maxPacketSize: number);
  }
}
