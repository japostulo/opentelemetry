import { logs, SeverityNumber, type AnyValueMap } from '@opentelemetry/api-logs';
import type { AttrRecord } from '../utils/flatten';

const LOGGER_NAME = '@haocruz/opentelemetry';
const LOGGER_VERSION = '1.2.0';

/**
 * Emits a log record directly to the OpenTelemetry logs API, bypassing
 * pino's auto-instrumentation. This is required because some consumers
 * (notably nestjs-pino) load `pino` at module-resolution time, which is
 * BEFORE `setupTracing()` runs — causing
 * `@opentelemetry/instrumentation-pino` to miss the pino instance.
 *
 * Records emitted here flow through the SDK's `LoggerProvider` →
 * `BatchLogRecordProcessor` → `GatedLogExporter` → OTLP, so the runtime
 * `LOG_DESTINATION` flag is honored automatically.
 */
export function otelEmit(
  severity: 'info' | 'warn' | 'error' | 'debug',
  body: string | Record<string, unknown>,
  attributes: AttrRecord = {},
): void {
  const map = {
    info: { text: 'INFO', num: SeverityNumber.INFO },
    warn: { text: 'WARN', num: SeverityNumber.WARN },
    error: { text: 'ERROR', num: SeverityNumber.ERROR },
    debug: { text: 'DEBUG', num: SeverityNumber.DEBUG },
  } as const;
  const sev = map[severity];

  logs
    .getLogger(LOGGER_NAME, LOGGER_VERSION)
    .emit({
      severityText: sev.text,
      severityNumber: sev.num,
      body,
      attributes: attributes as unknown as AnyValueMap,
    });
}
