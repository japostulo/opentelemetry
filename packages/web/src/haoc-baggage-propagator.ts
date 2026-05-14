import type { Context, TextMapPropagator, TextMapSetter, TextMapGetter } from '@opentelemetry/api';
import { propagation } from '@opentelemetry/api';
import { W3CBaggagePropagator } from '@opentelemetry/core';

import { getUser } from './identity';
import { getCurrentRouteName, getCurrentRoutePath } from './processor';
import type { BrowserInfo } from './browser';

/**
 * W3C Baggage propagator that enriches the baggage with the current client
 * context (page route, user identity, browser/device info) at inject-time.
 *
 * The standard `W3CBaggagePropagator` only serialises baggage that already
 * exists in the active `Context`. The problem is that our `HaocSpanProcessor`
 * previously attempted to write baggage entries in `onStart()` via
 * `propagation.setBaggage(parentContext, ...)`, which returns a new `Context`
 * that is immediately discarded — so the entries never reached the outgoing
 * request headers.
 *
 * This propagator solves the issue by reading the global module-level state
 * (user, route, browser info) **inside `inject()`**, which is called by the
 * fetch/XHR instrumentations right before serialising the request headers.
 * At that moment the enrichment is guaranteed to land in the `baggage` header.
 */
export class HaocEnrichedBaggagePropagator implements TextMapPropagator {
  private readonly inner = new W3CBaggagePropagator();

  constructor(private readonly browserInfo: BrowserInfo) {}

  inject<Carrier>(context: Context, carrier: Carrier, setter: TextMapSetter<Carrier>): void {
    // Start from any existing baggage already set in the context.
    let baggage = propagation.getBaggage(context) ?? propagation.createBaggage();

    // ── Page route ──────────────────────────────────────────────────────
    const routePath = getCurrentRoutePath();
    const routeName = getCurrentRouteName();
    if (routePath) {
      baggage = baggage.setEntry('page.route', { value: routeName || routePath });
    }
    if (typeof location !== 'undefined') {
      baggage = baggage.setEntry('page.url', { value: location.pathname });
    }

    // ── Browser / device info ───────────────────────────────────────────
    baggage = baggage.setEntry('device.type', { value: this.browserInfo['device.type'] });
    baggage = baggage.setEntry('browser.name', { value: this.browserInfo['browser.name'] });
    baggage = baggage.setEntry('app.platform', { value: this.browserInfo['app.platform'] });

    // ── User identity ───────────────────────────────────────────────────
    const user = getUser();
    if (user) {
      baggage = baggage.setEntry('user.id', { value: user.id });
    }

    // Inject using an enriched context — this is the key difference from
    // the old approach, which modified parentContext and discarded the result.
    const enrichedContext = propagation.setBaggage(context, baggage);
    this.inner.inject(enrichedContext, carrier, setter);
  }

  extract<Carrier>(context: Context, carrier: Carrier, getter: TextMapGetter<Carrier>): Context {
    return this.inner.extract(context, carrier, getter);
  }

  fields(): string[] {
    return this.inner.fields();
  }
}
