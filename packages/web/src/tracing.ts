import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { CompositePropagator } from '@opentelemetry/core';

import { detectBrowserInfo, type AppPlatform } from './browser';
import { HaocSpanProcessor } from './processor';
import { HaocEnrichedBaggagePropagator } from './haoc-baggage-propagator';
import { installErrorHandlers } from './errors';
import {
  matchesAny,
  resolveWebProfile,
  type OtelWebProfileName,
} from './profile';

export interface OtelWebConfig {
  /**
   * Service name reported in traces (e.g. 'totem-client').
   */
  serviceName: string;

  /**
   * OTLP HTTP trace exporter endpoint.
   * @default 'http://localhost:4318/v1/traces'
   */
  otlpEndpoint?: string;

  /**
   * Deployment environment (e.g. 'local', 'dev', 'production').
   * @default 'local'
   */
  environment?: string;

  /**
   * URLs/patterns of your APIs. Used for two purposes:
   * 1. CORS propagation of trace context (traceparent/baggage headers).
   * 2. Whitelist for span creation when the active profile sets
   *    `apiUrlsAsWhitelist=true` (default in `minimal`): fetch/XHR calls
   *    to URLs that do NOT match are dropped (no span emitted).
   *
   * Prefer this field over the legacy `propagateTraceUrls`.
   */
  apiUrls?: (string | RegExp)[];

  /**
   * @deprecated Alias of {@link apiUrls}. Kept for backwards compatibility.
   */
  propagateTraceUrls?: (string | RegExp)[];

  /**
   * Application platform. Auto-detected if not specified.
   */
  platform?: AppPlatform;

  /**
   * Named profile that selects a noise-reduction baseline:
   * - `minimal` (default): only fetch/XHR to `apiUrls` + errors.
   *   Document-load OFF; static assets ignored.
   * - `standard`: minimal + document-load.
   * - `verbose`: legacy "everything on" behaviour.
   *
   * Overridable via `VITE_OTEL_PROFILE` / `OTEL_PROFILE`.
   */
  profile?: OtelWebProfileName;

  /**
   * Head-based sampler ratio for `ParentBased(TraceIdRatioBased)`.
   * Range 0..1. Defaults to 1.0; the parent-based sampler ensures that
   * if the frontend samples a trace, the entire distributed trace
   * (frontend → API → Laravel) is preserved.
   * Overridable via `VITE_OTEL_SAMPLE_RATIO` / `OTEL_SAMPLE_RATIO`.
   */
  sampleRatio?: number;

  /**
   * Extra URL patterns to drop (no span). Strings compiled as case-
   * insensitive regex. Merged with profile defaults and
   * `VITE_OTEL_IGNORE_URLS` / `OTEL_IGNORE_URLS` (CSV).
   */
  ignoreUrls?: (string | RegExp)[];

  /**
   * Error messages to silently swallow (no span emitted by the global
   * error handlers). Merged with profile defaults
   * (`ResizeObserver loop limit exceeded`, `Script error.`, etc.).
   */
  ignoreErrorMessages?: (string | RegExp)[];

  /**
   * Enable global error handlers (window.onerror, unhandledrejection).
   * Default depends on profile (`true`).
   */
  enableErrorTracking?: boolean;

  /**
   * Enable document load instrumentation. Default depends on profile
   * (`false` in `minimal`, `true` in `standard`/`verbose`).
   */
  enableDocumentLoad?: boolean;

  /**
   * If true, only fetch/XHR calls whose URL matches `apiUrls` produce
   * spans. If false, all fetch/XHR calls produce spans (the default in
   * `standard`/`verbose`). In `minimal` this defaults to `true`.
   */
  apiUrlsAsWhitelist?: boolean;

  /**
   * Optional env source for env-based config resolution. When omitted, we
   * try `globalThis.process?.env`. Pass `import.meta.env` from Vite if you
   * want VITE_OTEL_* overrides to work in the browser.
   *
   * @example
   * ```ts
   * initTracing({
   *   serviceName: 'my-app',
   *   env: import.meta.env as Record<string, string | undefined>,
   * })
   * ```
   */
  env?: Record<string, string | undefined>;

  /**
   * Extra resource attributes merged with the defaults.
   */
  additionalResourceAttributes?: Record<string, string>;
}

/**
 * Initializes OpenTelemetry for web frontends.
 *
 * Sets up:
 * - WebTracerProvider with OTLP exporter and ParentBased(TraceIdRatio)
 *   sampler.
 * - Auto-instrumentation for Fetch, XMLHttpRequest, optionally DocumentLoad.
 * - URL filtering at instrumentation level (via `applyCustomAttributesOnSpan`
 *   short-circuit) and at processor level (second-line defense).
 * - Custom SpanProcessor that enriches all spans with page/browser/user
 *   context.
 * - W3C TraceContext + Baggage propagation.
 * - Global error handlers with ignore-list filtering.
 *
 * Call BEFORE creating your app (Vue, React, etc.).
 *
 * @example
 * ```ts
 * import { initTracing } from '@haocruz/opentelemetry-web';
 * initTracing({
 *   serviceName: 'totem-client',
 *   otlpEndpoint: 'http://signoz:4318/v1/traces',
 *   environment: 'production',
 *   apiUrls: [/https?:\/\/api\.example\.com/],
 *   env: import.meta.env as Record<string, string | undefined>,
 * });
 * ```
 */
export function initTracing(config: OtelWebConfig): WebTracerProvider {
  const endpoint = config.otlpEndpoint ?? 'http://localhost:4318/v1/traces';
  const environment = config.environment ?? 'local';

  const resolved = resolveWebProfile({
    profile: config.profile,
    sampleRatio: config.sampleRatio,
    ignoreUrls: config.ignoreUrls,
    ignoreErrorMessages: config.ignoreErrorMessages,
    enableDocumentLoad: config.enableDocumentLoad,
    enableErrorTracking: config.enableErrorTracking,
    apiUrlsAsWhitelist: config.apiUrlsAsWhitelist,
    env: config.env,
  });

  // ── Browser Info ────────────────────────────────────────────────────
  const browserInfo = detectBrowserInfo(config.platform);

  // ── Resource ────────────────────────────────────────────────────────
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: environment,
    'browser.name': browserInfo['browser.name'],
    'browser.version': browserInfo['browser.version'],
    'os.name': browserInfo['os.name'],
    'device.type': browserInfo['device.type'],
    'app.platform': browserInfo['app.platform'],
    'otel.profile': resolved.profile,
    ...config.additionalResourceAttributes,
  });

  // ── Sampler (ParentBased — distributed traces stay coherent) ────────
  const sampler = new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(resolved.sampleRatio),
  });

  // ── API URL patterns (used by processor + instrumentation hooks) ────
  const apiUrls = config.apiUrls ?? config.propagateTraceUrls ?? [];
  const apiUrlPatterns = apiUrls.map((u) =>
    typeof u === 'string' ? new RegExp(u, 'i') : u,
  );

  const shouldTraceUrl = (url: string): boolean => {
    if (matchesAny(resolved.ignoreUrls, url)) return false;
    if (resolved.apiUrlsAsWhitelist && apiUrlPatterns.length > 0) {
      return matchesAny(apiUrlPatterns, url);
    }
    return true;
  };

  // ── Exporter & Processor chain ──────────────────────────────────────
  const exporter = new OTLPTraceExporter({ url: endpoint });
  const batchProcessor = new BatchSpanProcessor(exporter);
  const haocProcessor = new HaocSpanProcessor(batchProcessor, browserInfo, {
    ignoreUrls: resolved.ignoreUrls,
    apiUrls: apiUrlPatterns,
    apiUrlsAsWhitelist: resolved.apiUrlsAsWhitelist,
  });

  // ── Provider ────────────────────────────────────────────────────────
  const provider = new WebTracerProvider({
    resource,
    sampler,
    spanProcessors: [haocProcessor],
  });

  provider.register({
    contextManager: new ZoneContextManager(),
    propagator: new CompositePropagator({
      propagators: [
        new W3CTraceContextPropagator(),
        new HaocEnrichedBaggagePropagator(browserInfo),
      ],
    }),
  });

  // ── Auto-Instrumentations ───────────────────────────────────────────
  registerInstrumentations({
    instrumentations: [
      new XMLHttpRequestInstrumentation({
        propagateTraceHeaderCorsUrls: apiUrls,
        ignoreUrls: resolved.ignoreUrls,
        applyCustomAttributesOnSpan: (span, xhr) => {
          // Second-line defense: when the URL is on the ignore list or
          // outside the apiUrls whitelist, mark the span so the processor
          // drops it before export.
          const url = (xhr as XMLHttpRequest & { responseURL?: string })
            .responseURL;
          if (url && !shouldTraceUrl(url)) {
            span.setAttribute('otel.drop', true);
            return;
          }
          // Enrich span name with path (default OTel name is just the method).
          if (url) {
            try {
              const parsed = new URL(url);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const method: string = (span as any).attributes?.['http.method'] ?? 'GET';
              span.updateName(`${method} ${parsed.pathname}`);
            } catch {
              // ignore URL parsing errors
            }
          }
        },
      }),
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: apiUrls,
        ignoreUrls: resolved.ignoreUrls,
        applyCustomAttributesOnSpan: (span, request, _result) => {
          const url =
            typeof request === 'string'
              ? request
              : (request as Request).url;
          if (url && !shouldTraceUrl(url)) {
            span.setAttribute('otel.drop', true);
            return;
          }
          // Enrich span name with path (default OTel name is just the method).
          if (url) {
            try {
              const parsed = new URL(url);
              const method =
                typeof request !== 'string'
                  ? (request as Request).method || 'GET'
                  : 'GET';
              span.updateName(`${method} ${parsed.pathname}`);
            } catch {
              // ignore URL parsing errors
            }
          }
        },
      }),
      ...(resolved.enableDocumentLoad
        ? [new DocumentLoadInstrumentation()]
        : []),
    ],
  });

  // ── Error Tracking ──────────────────────────────────────────────────
  if (resolved.enableErrorTracking) {
    installErrorHandlers({
      ignoreErrorMessages: resolved.ignoreErrorMessages,
    });
  }

  return provider;
}

// Re-export profile helpers so consumers can introspect resolution.
export { resolveWebProfile, matchesAny } from './profile';
export type { OtelWebProfileName, HaocWebProfileName, ResolvedWebProfile } from './profile';

/** @deprecated Use {@link OtelWebConfig} */
export type HaocWebConfig = OtelWebConfig;
