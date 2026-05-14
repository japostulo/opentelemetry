import type {
  LogRecordExporter,
  ReadableLogRecord,
} from '@opentelemetry/sdk-logs';
import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';

import { isOtlpEnabled } from './config';
import { OTEL_DIRECT_EMIT_ATTR } from './otel-emit';

/**
 * Attribute key added by the pino OTel instrumentation to identify
 * records that came via pino's log bridge.
 * @see https://opentelemetry.io/docs/specs/otel/logs/data-model/
 */
const PINO_LOG_EVENT_ATTR = 'log.event';

/**
 * Wraps a {@link LogRecordExporter} so that {@link export} becomes a
 * no-op when the runtime `LOG_DESTINATION` env var routes logs to
 * `console` or `none`.
 *
 * This is the mechanism that allows the playground `/admin/config`
 * endpoint to flip log emission on/off **at runtime** without having to
 * tear down and rebuild the OpenTelemetry NodeSDK or the application's
 * pino transport (which is mounted as Express middleware and cannot be
 * replaced without restarting the process).
 *
 * Pipeline always exists end-to-end; only the wire emission is gated.
 *
 * Additionally, this exporter deduplicates records: when both pino's
 * auto-instrumentation AND `otelEmit` fire for the same HAOC trace event
 * (identified by `log.event` attribute), only the `otelEmit` record
 * (marked with `haoc.direct_emit: true`) is forwarded.  This prevents
 * Express pino-http from creating plain-string-body duplicates alongside
 * the structured-JSON-body records emitted by `otelEmit`.
 */
export class GatedLogExporter implements LogRecordExporter {
  constructor(private readonly inner: LogRecordExporter) {}

  export(
    logs: ReadableLogRecord[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    if (!isOtlpEnabled()) {
      // Drop the batch silently — pretend success so the
      // BatchLogRecordProcessor doesn't retry.
      resultCallback({ code: ExportResultCode.SUCCESS });
      return;
    }

    // Drop pino-auto-instrumented duplicates of trace events.
    // A record is a duplicate if it carries `log.event` (trace attr)
    // but does NOT carry `otel.direct_emit` (our own marker).
    const filtered = logs.filter((record) => {
      const attrs = record.attributes as Record<string, unknown>;
      const hasLogEvent = attrs[PINO_LOG_EVENT_ATTR] !== undefined;
      const isDirectEmit = attrs[OTEL_DIRECT_EMIT_ATTR] === true;
      // Keep all non-event records, and only keep events that
      // came via otelEmit (not via pino instrumentation).
      return !hasLogEvent || isDirectEmit;
    });

    if (filtered.length === 0) {
      resultCallback({ code: ExportResultCode.SUCCESS });
      return;
    }

    // Strip the internal dedup marker before forwarding so it does not
    // appear as an attribute in SigNoz / the OTLP backend.
    for (const r of filtered) {
      delete (r.attributes as Record<string, unknown>)[OTEL_DIRECT_EMIT_ATTR];
    }

    this.inner.export(filtered, resultCallback);
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush ? this.inner.forceFlush() : Promise.resolve();
  }
}
