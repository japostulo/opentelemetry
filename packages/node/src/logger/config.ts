import type { LogDestination, LoggerConfig } from './types';
import { mergeRedactPaths } from './redaction';
import { ATTR_LOG_TITLE } from '../core/semantic-attributes';

// ── Destination helpers ─────────────────────────────────────────────────

export function getLogDestination(
  override?: LogDestination,
): LogDestination {
  if (override) return override;
  const raw = (process.env.LOG_DESTINATION ?? 'both').toLowerCase().trim();
  if (raw === 'signoz' || raw === 'console' || raw === 'none') {
    return raw as LogDestination;
  }
  return 'both';
}

export function isOtlpEnabled(destination?: LogDestination): boolean {
  const d = getLogDestination(destination);
  return d === 'both' || d === 'signoz';
}

export function isConsoleEnabled(destination?: LogDestination): boolean {
  const d = getLogDestination(destination);
  return d === 'both' || d === 'console';
}

// ── Pino-http config builder ────────────────────────────────────────────

/**
 * Builds a framework-agnostic pino-http options object.
 *
 * The console transport is **always** mounted (unless destination is
 * `none`). Whether log records also reach SigNoz via OTLP is controlled
 * **at runtime** by the {@link GatedLogExporter} on the SDK side — that
 * lets `LOG_DESTINATION` be flipped via `/admin/config` PUT without
 * having to rebuild the pino transport (impossible once `app.use()` is
 * called).
 *
 * @returns Either `{ pinoOptions }` (console transport) or
 *          `{ pinoOptions: { level: 'silent' } }` for `none`.
 */
export function buildLoggerConfig(config?: LoggerConfig) {
  const destination = getLogDestination(config?.destination);

  if (destination === 'none') {
    return { pinoOptions: { level: 'silent', autoLogging: false } };
  }

  const isProd =
    config?.isProduction ?? process.env.NODE_ENV === 'production';
  const level =
    config?.level ?? process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug');
  const environment =
    config?.environment ??
    process.env.OTEL_ENVIRONMENT ??
    process.env.APP_ENV ??
    'local';

  const redactPaths = mergeRedactPaths(config?.extraRedactPaths);

  const baseOptions: Record<string, unknown> = {
    level,
    autoLogging: false,
    redact: {
      paths: redactPaths,
      censor: '[REDACTED]',
    },
    serializers: {
      req: () => undefined,
      res: () => undefined,
    },
    customProps: () => ({ environment }),
    hooks: {
      // Auto-populate log.title with the log message so every app-level
      // log call (logger.info / debug / warn / error) is searchable by
      // title in SigNoz without requiring callers to set it manually.
      logMethod(
        inputArgs: unknown[],
        method: (...args: unknown[]) => void,
      ) {
        if (
          inputArgs.length >= 2 &&
          typeof inputArgs[0] === 'object' &&
          inputArgs[0] !== null &&
          typeof inputArgs[1] === 'string'
        ) {
          // logger.info(mergeObj, message, ...)
          const mergeObj = inputArgs[0] as Record<string, unknown>;
          if (!Object.prototype.hasOwnProperty.call(mergeObj, ATTR_LOG_TITLE)) {
            inputArgs[0] = { ...mergeObj, [ATTR_LOG_TITLE]: inputArgs[1] };
          }
        } else if (inputArgs.length >= 1 && typeof inputArgs[0] === 'string') {
          // logger.info(message, ...)
          return method.apply(this, [
            { [ATTR_LOG_TITLE]: inputArgs[0] },
            ...inputArgs,
          ]);
        }
        return method.apply(this, inputArgs);
      },
    },
  };

  // Console transport — async via pino worker thread (non-blocking)
  const consoleTransport = isProd
    ? {
        target: 'pino/file',
        level,
        options: { destination: 1, sync: false }, // fd 1 = stdout, async
      }
    : {
        target: 'pino-pretty',
        level,
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname,environment',
          messageFormat: '[{context}] {msg}',
          singleLine: true,
        },
      };

  // Always attach the console transport. OTLP emission is gated at
  // runtime by GatedLogExporter (see logger/gated-exporter.ts).
  return {
    pinoOptions: {
      ...baseOptions,
      transport: consoleTransport,
    },
  };
}
