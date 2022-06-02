/**
 * This logger uses Elastic Common Schema
 */
import { createLogger, transports } from "winston";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-ignore
import * as ecsFormat from "@elastic/ecs-winston-format";

export const ecsLogger = createLogger({
  format: ecsFormat(),
  transports: [new transports.Console()],
});
