import { Writable } from 'node:stream';
import type { LogDestination, LoggerConfig } from './types';
import { mergeRedactPaths } from './redaction';

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

// Null stream: silently discards all pino output.
// Used when destination is 'signoz' — pino has nowhere to write, but
// @opentelemetry/instrumentation-pino's mixin fires *before* the write,
// so BatchLogRecordProcessor still captures every log record.
const NULL_STREAM = new Writable({
  write(_chunk, _encoding, callback) {
    callback();
  },
});

// ── Pino-http config builder ────────────────────────────────────────────

/**
 * Builds a framework-agnostic pino-http options object.
 *
 * Returns either a plain options object (when using transport) or a tuple
 * `[options, stream]` (when routing to null stream for OTLP-only mode).
 *
 * This is the core of the logger configuration. Framework integrations
 * (NestJS LoggerModule, Express pino-http middleware) can consume this
 * directly.
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

  if (destination === 'signoz') {
    // OTLP only: discard all console output.
    return {
      pinoOptions: baseOptions,
      stream: NULL_STREAM,
    };
  }

  if (destination === 'console') {
    // Console only — no OTLP log processor.
    return {
      pinoOptions: {
        ...baseOptions,
        transport: consoleTransport,
      },
    };
  }

  // 'both': async console transport + OTLP via SDK BatchLogRecordProcessor
  return {
    pinoOptions: {
      ...baseOptions,
      transport: consoleTransport,
    },
  };
}
