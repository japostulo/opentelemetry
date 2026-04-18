export type { LogDestination, LoggerConfig } from './types';
export {
  buildLoggerConfig,
  getLogDestination,
  isOtlpEnabled,
  isConsoleEnabled,
} from './config';
export { DEFAULT_REDACT_PATHS, mergeRedactPaths } from './redaction';
