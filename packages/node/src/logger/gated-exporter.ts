import type {
  LogRecordExporter,
  ReadableLogRecord,
} from '@opentelemetry/sdk-logs';
import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';

import { isOtlpEnabled } from './config';

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
    this.inner.export(logs, resultCallback);
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush ? this.inner.forceFlush() : Promise.resolve();
  }
}
