import { createLogger, format, transports } from "winston";

export const plainTextLogger = createLogger({
  transports: [
    new transports.Console({
      format: format.simple(),
      level: "debug",
    }),
  ],
});
