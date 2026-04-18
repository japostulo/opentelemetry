import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { existsSync } from 'node:fs';
import { hostname } from 'node:os';

import type { HaocTelemetryConfig } from './types';
import { isOtlpEnabled } from '../logger/config';

/**
 * Detects if running inside a Docker container.
 * Checks for /.dockerenv file or DOCKER_CONTAINER env var.
 */
function isRunningInDocker(): boolean {
  return existsSync('/.dockerenv') || process.env.DOCKER_CONTAINER === 'true';
}

/**
 * Resolves the OTLP endpoint with smart defaults:
 * 1. Explicit config value
 * 2. OTEL_EXPORTER_OTLP_ENDPOINT env var
 * 3. http://host.docker.internal:4318 (inside Docker)
 * 4. http://localhost:4318 (fallback)
 */
function resolveOtlpEndpoint(configEndpoint?: string): string {
  if (configEndpoint) return configEndpoint;
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  return isRunningInDocker()
    ? 'http://host.docker.internal:4318'
    : 'http://localhost:4318';
}

/**
 * Initialises the OpenTelemetry NodeSDK with OTLP exporters for traces,
 * metrics, and (conditionally) logs.
 *
 * **Must be called before any framework bootstrap** (e.g. before
 * `NestFactory.create` / `express.listen`) so that auto-instrumentations
 * can patch modules early enough.
 *
 * @returns The started {@link NodeSDK} instance (useful for testing or
 *          manual shutdown).
 *
 * @example
 * ```ts
 * // main.ts — first line
 * import { setupTracing } from '@haoc/opentelemetry';
 * setupTracing({ serviceName: 'my-api' });
 * ```
 */
export function setupTracing(config: HaocTelemetryConfig): NodeSDK {
  const environment =
    config.environment ??
    process.env.OTEL_ENVIRONMENT ??
    process.env.APP_ENV ??
    'local';

  const otlpEndpoint = resolveOtlpEndpoint(config.otlpEndpoint);

  const debug =
    config.debug ?? process.env.OTEL_DEBUG === 'true';

  const metricIntervalMs = config.metricExportIntervalMs ?? 30_000;

  const disabledInstrumentations = config.disabledInstrumentations ?? [
    'fs',
    'net',
    'dns',
  ];

  // ── Diagnostics ───────────────────────────────────────────────────────
  if (debug) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  // ── Resource ──────────────────────────────────────────────────────────
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]:
      config.serviceName ?? process.env.OTEL_SERVICE_NAME ?? 'unknown',
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: environment,
    'service.version':
      config.serviceVersion ?? process.env.npm_package_version ?? 'unknown',
    'service.instance.id':
      process.env.HOSTNAME ?? hostname(),
    ...config.additionalResourceAttributes,
  });

  // ── Exporters ─────────────────────────────────────────────────────────
  const traceExporter = new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${otlpEndpoint}/v1/metrics`,
  });

  // Log exporter is conditional on destination mode
  const logRecordProcessor = isOtlpEnabled(config.logDestination)
    ? new BatchLogRecordProcessor(
        new OTLPLogExporter({ url: `${otlpEndpoint}/v1/logs` }),
      )
    : undefined;

  // ── Auto-instrumentations ─────────────────────────────────────────────
  const instrumentationConfig: Record<string, { enabled: boolean }> = {};
  for (const name of disabledInstrumentations) {
    instrumentationConfig[`@opentelemetry/instrumentation-${name}`] = {
      enabled: false,
    };
  }

  // HTTP request hook — always injects environment attribute, plus user hook
  instrumentationConfig['@opentelemetry/instrumentation-http'] = {
    ...instrumentationConfig['@opentelemetry/instrumentation-http'],
    requestHook: (span: unknown, request: unknown) => {
      // The cast is needed because the auto-instrumentation typings use
      // their own Span interface.
      (span as import('@opentelemetry/api').Span).setAttribute(
        'environment',
        environment,
      );
      config.httpRequestHook?.(
        span as import('@opentelemetry/api').Span,
        request,
      );
    },
  } as never;

  // ── SDK ───────────────────────────────────────────────────────────────
  const sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: metricIntervalMs,
      }),
    ],
    ...(logRecordProcessor ? { logRecordProcessors: [logRecordProcessor] } : {}),
    instrumentations: [
      getNodeAutoInstrumentations(instrumentationConfig as never),
    ],
  });

  sdk.start();

  // ── Graceful shutdown ─────────────────────────────────────────────────
  const shutdown = () => {
    sdk.shutdown().finally(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return sdk;
}
