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
import {
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { existsSync } from 'node:fs';
import { hostname } from 'node:os';
import { URL } from 'node:url';

import type { HaocTelemetryConfig } from './types';
import { isOtlpEnabled } from '../logger/config';
import {
  matchesAny,
  resolveProfile,
  type ResolvedProfile,
} from './profile';

/**
 * Detects if running inside a Docker container.
 */
function isRunningInDocker(): boolean {
  return existsSync('/.dockerenv') || process.env.DOCKER_CONTAINER === 'true';
}

/**
 * Resolves the OTLP endpoint with smart defaults.
 */
function resolveOtlpEndpoint(configEndpoint?: string): string {
  if (configEndpoint) return configEndpoint;
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT)
    return process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  return isRunningInDocker()
    ? 'http://host.docker.internal:4318'
    : 'http://localhost:4318';
}

/**
 * Builds the per-instrumentation config object consumed by
 * `getNodeAutoInstrumentations()`. Disabled instrumentations are turned
 * off; the HTTP one gets `ignoreIncomingRequestHook` /
 * `ignoreOutgoingRequestHook` and the Express one gets `ignoreLayersType`.
 */
function buildInstrumentationConfig(
  resolved: ResolvedProfile,
  environment: string,
  userHook?: HaocTelemetryConfig['httpRequestHook'],
): Record<string, unknown> {
  const cfg: Record<string, unknown> = {};

  // Disable instrumentations whose profile flag is false.
  const disable = (name: string) => {
    cfg[`@opentelemetry/instrumentation-${name}`] = { enabled: false };
  };
  for (const [name, enabled] of Object.entries(resolved.instrumentations)) {
    if (!enabled) disable(name);
  }

  // ── HTTP: filter incoming + outgoing + enrichment hook ───────────────
  if (resolved.instrumentations.http) {
    cfg['@opentelemetry/instrumentation-http'] = {
      ignoreIncomingRequestHook: (req: { url?: string }): boolean => {
        const url = req.url ?? '';
        // The url here is the raw request-target (e.g. "/health?x=1");
        // strip query for matching.
        const path = url.split('?')[0];
        return matchesAny(resolved.ignoreIncomingPaths, path);
      },
      ignoreOutgoingRequestHook: (req: {
        hostname?: string;
        host?: string;
        path?: string;
        href?: string;
      }): boolean => {
        const target =
          req.href ??
          `${req.hostname ?? req.host ?? ''}${req.path ?? ''}`;
        return matchesAny(resolved.ignoreOutgoingUrls, target);
      },
      requestHook: (span: unknown, request: unknown) => {
        (span as import('@opentelemetry/api').Span).setAttribute(
          'environment',
          environment,
        );
        userHook?.(span as import('@opentelemetry/api').Span, request);
      },
    };
  }

  // ── Express: drop noisy layer spans ──────────────────────────────────
  if (
    resolved.instrumentations.express &&
    resolved.expressIgnoreLayers.length > 0
  ) {
    cfg['@opentelemetry/instrumentation-express'] = {
      ignoreLayersType: resolved.expressIgnoreLayers,
    };
  }

  return cfg;
}

/**
 * Initialises the OpenTelemetry NodeSDK with OTLP exporters for traces,
 * metrics, and (conditionally) logs.
 *
 * **Must be called before any framework bootstrap** (e.g. before
 * `NestFactory.create` / `express.listen`) so that auto-instrumentations
 * can patch modules early enough.
 *
 * @example
 * ```ts
 * import { setupTracing } from '@haocruz/opentelemetry';
 * setupTracing({ serviceName: 'my-api', profile: 'minimal' });
 * ```
 */
export function setupTracing(config: HaocTelemetryConfig): NodeSDK {
  const environment =
    config.environment ??
    process.env.OTEL_ENVIRONMENT ??
    process.env.APP_ENV ??
    'local';

  const otlpEndpoint = resolveOtlpEndpoint(config.otlpEndpoint);

  const debug = config.debug ?? process.env.OTEL_DEBUG === 'true';

  const metricIntervalMs = config.metricExportIntervalMs ?? 30_000;

  // ── Profile resolution (programmatic > env > defaults) ───────────────
  const resolved = resolveProfile({
    profile: config.profile,
    sampleRatio: config.sampleRatio,
    ignoreIncomingPaths: config.ignoreIncomingPaths,
    ignoreOutgoingUrls: config.ignoreOutgoingUrls,
    ignoreRoutes: config.ignoreRoutes,
    expressIgnoreLayers: config.expressIgnoreLayers,
    captureRequestBody: config.captureRequestBody,
    captureResponseBody: config.captureResponseBody,
    instrumentations: {
      ...config.instrumentations,
      // legacy `disabledInstrumentations` array → flag map
      ...Object.fromEntries(
        (config.disabledInstrumentations ?? []).map((name) => [name, false]),
      ),
    },
  });

  // Expose resolved profile to interceptor/middleware via process.env so
  // that they don't need to be wired through DI explicitly.
  process.env.HAOC_OTEL_RESOLVED_PROFILE = JSON.stringify({
    profile: resolved.profile,
    captureRequestBody: resolved.captureRequestBody,
    captureResponseBody: resolved.captureResponseBody,
    ignoreRoutes: resolved.ignoreRoutes.map((r) => r.source),
  });

  // ── Diagnostics ──────────────────────────────────────────────────────
  if (debug) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
    diag.info(
      `[haoc-otel] profile=${resolved.profile} sampleRatio=${resolved.sampleRatio}`,
    );
  }

  // ── Resource ─────────────────────────────────────────────────────────
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]:
      config.serviceName ?? process.env.OTEL_SERVICE_NAME ?? 'unknown',
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: environment,
    'service.version':
      config.serviceVersion ?? process.env.npm_package_version ?? 'unknown',
    'service.instance.id': process.env.HOSTNAME ?? hostname(),
    'haoc.otel.profile': resolved.profile,
    ...config.additionalResourceAttributes,
  });

  // ── Sampler (head-based, ParentBased so distributed traces are kept) ─
  const sampler = new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(resolved.sampleRatio),
  });

  // ── Exporters ────────────────────────────────────────────────────────
  const traceExporter = new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${otlpEndpoint}/v1/metrics`,
  });

  const logRecordProcessor = isOtlpEnabled(config.logDestination)
    ? new BatchLogRecordProcessor(
        new OTLPLogExporter({ url: `${otlpEndpoint}/v1/logs` }),
      )
    : undefined;

  // ── Instrumentations ────────────────────────────────────────────────
  const instrumentationConfig = buildInstrumentationConfig(
    resolved,
    environment,
    config.httpRequestHook,
  );

  // ── SDK ─────────────────────────────────────────────────────────────
  const sdk = new NodeSDK({
    resource,
    sampler,
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

  // ── Graceful shutdown ────────────────────────────────────────────────
  const shutdown = () => {
    sdk.shutdown().finally(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return sdk;
}

// Re-export helpers used by interceptor/middleware for runtime decisions.
export { resolveProfile, matchesAny } from './profile';
export type {
  HaocProfileName,
  ResolvedProfile,
  ExpressIgnoreLayer,
} from './profile';
