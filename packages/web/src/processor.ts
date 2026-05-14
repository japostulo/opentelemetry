import { Context, propagation } from '@opentelemetry/api';
import { SpanProcessor, ReadableSpan, Span } from '@opentelemetry/sdk-trace-base';
import { getUser, USER_ATTR, USER_TYPE_ATTR, USER_ROLE_ATTR } from './identity';
import type { BrowserInfo } from './browser';
import { matchesAny } from './profile';

export interface HaocSpanProcessorOptions {
  /**
   * URL patterns whose spans should be dropped before export. Compared
   * against `http.url`, `http.target`, and the span name.
   */
  ignoreUrls?: RegExp[];

  /**
   * API URL patterns. When `apiUrlsAsWhitelist` is true, only spans
   * whose `http.url` matches one of these patterns are kept; all others
   * are dropped.
   */
  apiUrls?: RegExp[];

  /**
   * When true (default in `minimal` profile), spans whose URL does NOT
   * match `apiUrls` are silently dropped.
   */
  apiUrlsAsWhitelist?: boolean;
}

// ── Module-level Route State ────────────────────────────────────────────

let _currentRouteName = '';
let _currentRoutePath = '';

/**
 * Updates the current route info. Call this from your router's afterEach hook:
 *
 * @example
 * ```ts
 * router.afterEach((to) => {
 *   setCurrentRoute(String(to.name ?? ''), to.path);
 * });
 * ```
 */
export function setCurrentRoute(routeName: string, routePath: string): void {
  _currentRouteName = routeName;
  _currentRoutePath = routePath;
}

/**
 * Custom SpanProcessor that enriches every span with:
 * - Page context (page.url, page.route, page.title)
 * - Browser/device info (browser.name, device.type, etc.)
 * - User identity (haoc.user.id, haoc.user.type)
 * - W3C Baggage propagation for cross-service context
 *
 * This processor delegates export to the wrapped inner processor
 * (typically a BatchSpanProcessor).
 */
export class HaocSpanProcessor implements SpanProcessor {
  private readonly browserInfo: BrowserInfo;
  private readonly inner: SpanProcessor;
  private readonly ignoreUrls: RegExp[];
  private readonly apiUrls: RegExp[];
  private readonly apiUrlsAsWhitelist: boolean;

  constructor(
    inner: SpanProcessor,
    browserInfo: BrowserInfo,
    options: HaocSpanProcessorOptions = {},
  ) {
    this.inner = inner;
    this.browserInfo = browserInfo;
    this.ignoreUrls = options.ignoreUrls ?? [];
    this.apiUrls = options.apiUrls ?? [];
    this.apiUrlsAsWhitelist = options.apiUrlsAsWhitelist ?? false;
  }

  /**
   * Returns true when the span should be dropped (not forwarded to the
   * inner processor). Looks at the `haoc.drop` marker set by the
   * instrumentation hooks, the span's `http.url` attribute, and the span
   * name as a last resort.
   */
  private shouldDrop(span: Span | ReadableSpan): boolean {
    const attrs = span.attributes as Record<string, unknown>;
    if (attrs['otel.drop'] === true) return true;

    // URL-based filtering
    const httpUrl = (attrs['http.url'] ?? attrs['url.full']) as string | undefined;

    // Ignore-list check
    if (this.ignoreUrls.length > 0) {
      const candidates = [httpUrl, attrs['http.target'] as string | undefined, span.name];
      for (const c of candidates) {
        if (typeof c === 'string' && matchesAny(this.ignoreUrls, c)) {
          return true;
        }
      }
    }

    // Whitelist check: drop spans for URLs NOT matching apiUrls
    if (this.apiUrlsAsWhitelist && this.apiUrls.length > 0 && httpUrl) {
      if (!matchesAny(this.apiUrls, httpUrl)) {
        return true;
      }
    }

    return false;
  }

  onStart(span: Span, parentContext: Context): void {
    if (this.shouldDrop(span)) {
      // We can't truly cancel span creation, but skipping enrichment and
      // delegating-onStart prevents downstream processors from acting on
      // it; the matching onEnd also short-circuits export.
      return;
    }

    // ── Page Context ──────────────────────────────────────────────────
    if (typeof location !== 'undefined') {
      span.setAttribute('page.url', location.pathname + location.search);
      span.setAttribute('page.title', document.title);
    }
    if (_currentRouteName) {
      span.setAttribute('page.route', _currentRouteName);
    }
    if (_currentRoutePath) {
      span.setAttribute('page.path', _currentRoutePath);
    }

    // ── Browser & Device ────────────────────────────────────────────
    for (const [key, value] of Object.entries(this.browserInfo)) {
      span.setAttribute(key, value);
    }

    // ── User Identity ───────────────────────────────────────────────
    const user = getUser();
    if (user) {
      span.setAttribute(USER_ATTR, user.id);
      span.setAttribute(USER_TYPE_ATTR, user.type ?? 'authenticated');
      if (user.role) {
        span.setAttribute(USER_ROLE_ATTR, user.role);
      }
    } else {
      span.setAttribute(USER_TYPE_ATTR, 'anonymous');
    }

    // ── Baggage Propagation ─────────────────────────────────────────
    // Set baggage entries so backends can read client context
    let baggage = propagation.getBaggage(parentContext) ?? propagation.createBaggage();
    if (_currentRoutePath) {
      baggage = baggage.setEntry('page.route', { value: _currentRouteName || _currentRoutePath });
    }
    if (typeof location !== 'undefined') {
      baggage = baggage.setEntry('page.url', { value: location.pathname });
    }
    baggage = baggage.setEntry('device.type', { value: this.browserInfo['device.type'] });
    baggage = baggage.setEntry('browser.name', { value: this.browserInfo['browser.name'] });
    baggage = baggage.setEntry('app.platform', { value: this.browserInfo['app.platform'] });

    if (user) {
      baggage = baggage.setEntry('user.id', { value: user.id });
    }

    // Store baggage in context for downstream propagation
    propagation.setBaggage(parentContext, baggage);

    this.inner.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    if (this.shouldDrop(span)) return;

    // ── Enrich span name with HTTP path ─────────────────────────────
    // OTel default for XHR/fetch is just the method ("GET", "POST").
    // We upgrade to "METHOD /path" using http.url when available.
    const attrs = span.attributes;
    const httpUrl = attrs['http.url'] as string | undefined;
    if (httpUrl && /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/i.test(span.name)) {
      try {
        const parsed = new URL(httpUrl);
        // ReadableSpan is read-only, but the underlying Span object is
        // still mutable at this point (before the batch export flushes).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (span as any).name = `${span.name} ${parsed.pathname}`;
      } catch {
        // ignore URL parsing errors
      }
    }

    this.inner.onEnd(span);
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush();
  }
}
