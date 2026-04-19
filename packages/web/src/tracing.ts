import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
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
import { CompositePropagator, W3CBaggagePropagator } from '@opentelemetry/core';

import { detectBrowserInfo, type AppPlatform } from './browser';
import { HaocSpanProcessor } from './processor';
import { installErrorHandlers } from './errors';

export interface HaocWebConfig {
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
   * URLs/patterns for which trace context (traceparent/tracestate + baggage)
   * should be propagated via CORS.
   *
   * Typically your API URLs.
   *
   * @example
   * ```ts
   * propagateTraceUrls: [
   *   /https?:\/\/api\.haoc\.net/,
   *   'http://localhost:3002',
   * ]
   * ```
   */
  propagateTraceUrls?: (string | RegExp)[];

  /**
   * Application platform.
   * Auto-detected if not specified (web-browser, electron).
   * @default auto-detected
   */
  platform?: AppPlatform;

  /**
   * Enable global error handlers (window.onerror, unhandledrejection).
   * @default true
   */
  enableErrorTracking?: boolean;

  /**
   * Enable document load instrumentation (DOMContentLoaded, Load).
   * @default true
   */
  enableDocumentLoad?: boolean;

  /**
   * Extra resource attributes merged with the defaults.
   */
  additionalResourceAttributes?: Record<string, string>;
}

/**
 * Initializes HAOC OpenTelemetry for web frontends.
 *
 * Sets up:
 * - WebTracerProvider with OTLP exporter
 * - Auto-instrumentation for Fetch, XMLHttpRequest, DocumentLoad
 * - Custom SpanProcessor that enriches all spans with page/browser/user context
 * - W3C TraceContext + Baggage propagation
 * - Global error handlers
 *
 * Call this BEFORE creating your app (Vue, React, etc.):
 *
 * @example
 * ```ts
 * import { initTracing } from '@haocruz/opentelemetry-web';
 * initTracing({
 *   serviceName: 'totem-client',
 *   otlpEndpoint: 'http://signoz.haoc.net:4318/v1/traces',
 *   environment: 'production',
 *   propagateTraceUrls: [/https?:\/\/api\.totem\.haoc/],
 * });
 * ```
 */
export function initTracing(config: HaocWebConfig): WebTracerProvider {
  const endpoint = config.otlpEndpoint ?? 'http://localhost:4318/v1/traces';
  const environment = config.environment ?? 'local';

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
    ...config.additionalResourceAttributes,
  });

  // ── Exporter ────────────────────────────────────────────────────────
  const exporter = new OTLPTraceExporter({ url: endpoint });

  // ── Custom SpanProcessor (wraps BatchSpanProcessor) ─────────────────
  const batchProcessor = new BatchSpanProcessor(exporter);
  const haocProcessor = new HaocSpanProcessor(batchProcessor, browserInfo);

  // ── Provider ────────────────────────────────────────────────────────
  const provider = new WebTracerProvider({
    resource,
    spanProcessors: [haocProcessor],
  });

  // Register with W3C TraceContext + Baggage propagators
  provider.register({
    contextManager: new ZoneContextManager(),
    propagator: new CompositePropagator({
      propagators: [
        new W3CTraceContextPropagator(),
        new W3CBaggagePropagator(),
      ],
    }),
  });

  // ── Auto-Instrumentations ──────────────────────────────────────────
  const propagateUrls = config.propagateTraceUrls ?? [];

  registerInstrumentations({
    instrumentations: [
      new XMLHttpRequestInstrumentation({
        propagateTraceHeaderCorsUrls: propagateUrls,
      }),
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: propagateUrls,
      }),
      ...(config.enableDocumentLoad !== false
        ? [new DocumentLoadInstrumentation()]
        : []),
    ],
  });

  // ── Error Tracking ─────────────────────────────────────────────────
  if (config.enableErrorTracking !== false) {
    installErrorHandlers();
  }

  return provider;
}
