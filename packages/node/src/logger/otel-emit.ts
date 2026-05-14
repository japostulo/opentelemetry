import { logs, SeverityNumber, type AnyValueMap } from '@opentelemetry/api-logs';
import type { AttrRecord } from '../utils/flatten';

const LOGGER_NAME = '@haocruz/opentelemetry';
const LOGGER_VERSION = '1.2.0';

/**
 * Internal marker attribute added to every `otelEmit` record.
 * Used by {@link GatedLogExporter} to drop duplicate records emitted by
 * `@opentelemetry/instrumentation-pino` when the pino logger is also
 * called with the same `haoc.log.event` payload.
 */
export const HAOC_DIRECT_EMIT_ATTR = 'haoc.direct_emit';

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
 *
 * When `body` is an object it is passed as an OTel `AnyValueMap` so that
 * collectors / UIs (e.g. SigNoz) render it as a structured tree view
 * instead of a raw JSON string.
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

  // Pass objects directly as AnyValueMap so SigNoz renders a tree view.
  // Plain strings are kept as-is.
  const bodyValue: string | AnyValueMap =
    typeof body === 'string' ? body : (body as unknown as AnyValueMap);

  logs
    .getLogger(LOGGER_NAME, LOGGER_VERSION)
    .emit({
      severityText: sev.text,
      severityNumber: sev.num,
      body: bodyValue,
      attributes: {
        ...attributes,
        [HAOC_DIRECT_EMIT_ATTR]: true,
      } as unknown as AnyValueMap,
    });
}
