import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes, processDetector, envDetector, hostDetector, osDetector, serviceInstanceIdDetector } from '@opentelemetry/resources';
import type { ResourceDetector, DetectedResource, DetectedResourceAttributes } from '@opentelemetry/resources';
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

import type { OtelConfig } from './types';
import { GatedLogExporter } from '../logger/gated-exporter';
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
  userHook?: OtelConfig['httpRequestHook'],
): Record<string, unknown> {
  const cfg: Record<string, unknown> = {};

  // Some profile keys differ from their npm package suffix.
  const PACKAGE_NAME_MAP: Record<string, string> = {
    nestjs: 'nestjs-core',
  };

  // Disable instrumentations whose profile flag is false.
  const disable = (name: string) => {
    const pkgName = PACKAGE_NAME_MAP[name] ?? name;
    cfg[`@opentelemetry/instrumentation-${pkgName}`] = { enabled: false };
  };
  for (const [name, enabled] of Object.entries(resolved.instrumentations)) {
    if (!enabled) disable(name);
  }

  // ── HTTP: filter incoming + outgoing + enrichment hook ───────────────
  if (resolved.instrumentations.http) {
    cfg['@opentelemetry/instrumentation-http'] = {
      ignoreIncomingRequestHook: (req: { url?: string; method?: string }): boolean => {
        // Drop OPTIONS preflight for non-verbose profiles.
        if (resolved.ignoreOptions && req.method?.toUpperCase() === 'OPTIONS') {
          return true;
        }
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
        const s = span as import('@opentelemetry/api').Span;
        const req = request as Record<string, unknown>;
        s.setAttribute('environment', environment);

        // Rename outgoing HTTP client spans from bare "GET" to "GET /path".
        // Outgoing requests (http.ClientRequest) have `.path` but no `.url`.
        // Incoming requests (http.IncomingMessage) have `.url` instead.
        const path = req['path'] as string | undefined;
        const url = req['url'] as string | undefined;
        const method = req['method'] as string | undefined;
        if (path && !url && method) {
          const cleanPath = path.split('?')[0] || '/';
          s.updateName(`${method} ${cleanPath}`);
        }

        userHook?.(s, request);
      },
    };
  }

  // ── Undici (Node.js built-in fetch): rename "GET" → "GET /path" ──────
  // native fetch uses undici under the hood; its default span name is just
  // the HTTP method. We enrich it with the path at requestHook time.
  cfg['@opentelemetry/instrumentation-undici'] = {
    requestHook: (span: unknown, request: unknown) => {
      const s = span as import('@opentelemetry/api').Span;
      const req = request as { method?: string; path?: string };
      if (req.method && req.path) {
        const cleanPath = req.path.split('?')[0] || '/';
        s.updateName(`${req.method} ${cleanPath}`);
      }
    },
  };

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
export function setupTracing(config?: OtelConfig): NodeSDK {
  config = config ?? {};
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
    logRequestBody: config.logRequestBody,
    logResponseBody: config.logResponseBody,
    logBodyIgnoreRoutes: config.logBodyIgnoreRoutes,
    logBodyOnlyRoutes: config.logBodyOnlyRoutes,
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
  process.env.OTEL_RESOLVED_PROFILE = JSON.stringify({
    profile: resolved.profile,
    captureRequestBody: resolved.captureRequestBody,
    captureResponseBody: resolved.captureResponseBody,
    logRequestBody: resolved.logRequestBody,
    logResponseBody: resolved.logResponseBody,
    logPayloadMode: resolved.logPayloadMode,
    ignoreRoutes: resolved.ignoreRoutes.map((r) => r.source),
    logBodyIgnoreRoutes: resolved.logBodyIgnoreRoutes.map((r) => r.source),
    logBodyOnlyRoutes: resolved.logBodyOnlyRoutes.map((r) => r.source),
  });

  // ── Diagnostics ──────────────────────────────────────────────────────
  if (debug) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
    diag.info(
      `[haoc-otel] profile=${resolved.profile} sampleRatio=${resolved.sampleRatio}`,
    );
  }

  // ── Resource ─────────────────────────────────────────────────────────
  // NOTE: `haoc.otel.profile` is intentionally NOT included as a resource
  // attribute. Resource attrs are immutable after SDK init; the active
  // profile can change at runtime via /admin/config and we want every
  // span/log to reflect the *current* profile. The attribute is therefore
  // applied per-span by the framework interceptors/middlewares (NestJS
  // `OtelInterceptor`, Express `createTraceMiddleware`) and per-log
  // record by `otelEmit()`.

  // Custom process detector that strips duplicated attrs:
  //   process.executable.path  — same value as process.executable.name
  //   process.runtime.description — same value as process.runtime.name
  const filteredProcessDetector: ResourceDetector = {
    detect(): DetectedResource {
      const { attributes } = processDetector.detect();
      const exclude = new Set(['process.executable.path', 'process.runtime.description']);
      const filtered = Object.fromEntries(
        Object.entries(attributes as DetectedResourceAttributes).filter(([k]) => !exclude.has(k)),
      ) as DetectedResourceAttributes;
      return { attributes: filtered };
    },
  };

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]:
      config.serviceName ?? process.env.OTEL_SERVICE_NAME ?? 'unknown',
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: environment,
    'service.version':
      config.serviceVersion ?? process.env.npm_package_version ?? 'unknown',
    'service.instance.id': process.env.HOSTNAME ?? hostname(),
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

  const logRecordProcessor = new BatchLogRecordProcessor(
    new GatedLogExporter(
      new OTLPLogExporter({ url: `${otlpEndpoint}/v1/logs` }),
    ),
  );

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
    logRecordProcessors: [logRecordProcessor],
    resourceDetectors: [
      envDetector,
      hostDetector,
      osDetector,
      serviceInstanceIdDetector,
      filteredProcessDetector,
    ],
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
export { resolveProfile, matchesAny, shouldLogBodyForRoute } from './profile';
export type {
  HaocProfileName,
  ResolvedProfile,
  ExpressIgnoreLayer,
} from './profile';
