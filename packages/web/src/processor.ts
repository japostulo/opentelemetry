import { Context, propagation } from '@opentelemetry/api';
import { SpanProcessor, ReadableSpan, Span } from '@opentelemetry/sdk-trace-base';
import { getUser, HAOC_USER_ATTR, HAOC_USER_TYPE_ATTR, HAOC_USER_ROLE_ATTR } from './identity';
import type { BrowserInfo } from './browser';
import { matchesAny } from './profile';

export interface HaocSpanProcessorOptions {
  /**
   * URL patterns whose spans should be dropped before export. Compared
   * against `http.url`, `http.target`, and the span name.
   */
  ignoreUrls?: RegExp[];
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

  constructor(
    inner: SpanProcessor,
    browserInfo: BrowserInfo,
    options: HaocSpanProcessorOptions = {},
  ) {
    this.inner = inner;
    this.browserInfo = browserInfo;
    this.ignoreUrls = options.ignoreUrls ?? [];
  }

  /**
   * Returns true when the span should be dropped (not forwarded to the
   * inner processor). Looks at the `haoc.drop` marker set by the
   * instrumentation hooks, the span's `http.url` attribute, and the span
   * name as a last resort.
   */
  private shouldDrop(span: Span | ReadableSpan): boolean {
    const attrs = span.attributes as Record<string, unknown>;
    if (attrs['haoc.drop'] === true) return true;
    if (this.ignoreUrls.length === 0) return false;
    const candidates = [
      attrs['http.url'],
      attrs['http.target'],
      span.name,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && matchesAny(this.ignoreUrls, c)) {
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
      span.setAttribute(HAOC_USER_ATTR, user.id);
      span.setAttribute(HAOC_USER_TYPE_ATTR, user.type ?? 'authenticated');
      if (user.role) {
        span.setAttribute(HAOC_USER_ROLE_ATTR, user.role);
      }
    } else {
      span.setAttribute(HAOC_USER_TYPE_ATTR, 'anonymous');
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
      baggage = baggage.setEntry('haoc.user.id', { value: user.id });
    }

    // Store baggage in context for downstream propagation
    propagation.setBaggage(parentContext, baggage);

    this.inner.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    if (this.shouldDrop(span)) return;
    this.inner.onEnd(span);
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush();
  }
}
