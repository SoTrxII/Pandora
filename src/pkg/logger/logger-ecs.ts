/**
 * This logger uses Elastic Common Schema
 */
import { createLogger, transports } from "winston";
import { ecsFormat } from "@elastic/ecs-winston-format";

export const ecsLogger = createLogger({
  format: ecsFormat(),
  transports: [new transports.Console()],
});
