/**
 * General purpose logging interface
 */

interface ILoggerOpts {
  /** Optional Error object. Will be converted into an ECS error */
  err?: Error;
}

export interface ILogger {
  debug(message: string, opts?: ILoggerOpts): void;

  info(message: string, opts?: ILoggerOpts): void;

  warn(message: string, opts?: ILoggerOpts): void;

  error(message: string, opts?: ILoggerOpts): void;
}
