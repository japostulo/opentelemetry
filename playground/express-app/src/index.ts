import { setupTracing, trace, context, resolveProfile, _resetRuntimeProfileCache, getRuntimeProfile, identifyUser, getUser } from '@haocruz/opentelemetry';

setupTracing({
  serviceName: 'playground-express',
});

import express from 'express';
import { createTraceMiddleware, createPinoMiddleware } from '@haocruz/opentelemetry/express';

const app = express();

// ── CORS (playground — allow all origins) ─────────────────────────────────
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, traceparent, tracestate, baggage, X-Request-ID, x-user-id, x-user-role, x-test-run-id',
  );
  res.header('Access-Control-Expose-Headers', 'X-Trace-Id');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (_req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json());
app.use(createPinoMiddleware());
app.use(createTraceMiddleware());

app.get('/hello', (req, res) => {
  const span = trace.getSpan(context.active());
  const traceId = span?.spanContext().traceId ?? 'none';

  req.log.info({ step: 'handler', traceId }, 'Processing /hello');

  res.json({
    service: 'express',
    traceId,
    message: 'Hello from Express playground!',
  });
});

app.get('/chain', async (req, res) => {
  const span = trace.getSpan(context.active());
  const traceId = span?.spanContext().traceId ?? 'none';

  req.log.info({ step: 'fetching-downstream', traceId }, 'Chain: calling laravel-app');

  try {
    const fwdHeaders: Record<string, string> = {};
    if (req.headers['x-test-run-id']) fwdHeaders['x-test-run-id'] = String(req.headers['x-test-run-id']);
    const upstream = await fetch('http://laravel-app:8080/api/hello', { headers: fwdHeaders });
    const downstream = await upstream.json();

    req.log.info({ step: 'downstream-received', status: upstream.status, traceId }, 'Chain: response received');

    res.json({ service: 'express', traceId, downstream });
  } catch (err) {
    res.status(502).json({
      service: 'express',
      traceId,
      error: err instanceof Error ? err.message : 'upstream failed',
    });
  }
});

app.post('/echo', (req, res) => {
  const span = trace.getSpan(context.active());
  res.json({
    service: 'express',
    traceId: span?.spanContext().traceId ?? 'none',
    received: req.body,
  });
});

app.get('/error-5xx', (_req, res) => {
  const span = trace.getSpan(context.active());
  span?.setStatus({ code: 2 /* SpanStatusCode.ERROR */, message: 'Simulated DB failure' });
  span?.setAttribute('error.type', 'DatabaseConnectionError');
  span?.setAttribute('error.message', 'ECONNREFUSED 127.0.0.1:27017');
  res.status(500).json({
    service: 'express',
    traceId: span?.spanContext().traceId ?? 'none',
    error: 'Database connection refused',
  });
});

app.get('/error-4xx', (_req, res) => {
  res.status(400).json({
    service: 'express',
    error: 'Validation failed: missing required field',
  });
});

app.get('/slow', async (req, res) => {
  const delay = Math.min(Number(req.query.ms) || 2000, 10000);
  const span = trace.getSpan(context.active());
  span?.setAttribute('test.delay_ms', delay);
  await new Promise(r => setTimeout(r, delay));
  res.json({
    service: 'express',
    traceId: span?.spanContext().traceId ?? 'none',
    delayed: delay,
  });
});

// ── User Identity ──────────────────────────────────────────────────────────

/**
 * Simulates JWT/API-key auth middleware for playground tests.
 * In a real app, verify a JWT and extract the user from it.
 *
 * Test:
 *   curl -H "x-user-id: usr_42" http://localhost:3020/secured/profile
 *   curl -H "x-user-id: usr_99" -H "x-user-role: admin" http://localhost:3020/secured/profile
 *   curl http://localhost:3020/secured/profile       # → 401
 */
function fakeAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  const userId = req.headers['x-user-id'] as string | undefined;
  if (!userId) {
    res.status(401).json({ error: 'Missing x-user-id header' });
    return;
  }
  const role = (req.headers['x-user-role'] as string | undefined) ?? 'viewer';

  // identifyUser stores the identity in the async context AND writes to the active span
  identifyUser({ id: userId, role, type: 'authenticated' });
  next();
}

/** No guard — shows identifyUser() used inline (e.g. after looking up a session). */
app.get('/identity', (req, res) => {
  const span = trace.getSpan(context.active());

  // In a real app this data would come from a JWT or session lookup
  const userId = (req.headers['x-user-id'] as string | undefined) ?? 'anon';
  identifyUser({ id: userId, type: 'authenticated' });

  res.json({
    service: 'express',
    traceId: span?.spanContext().traceId ?? 'none',
    user: getUser(),
    tip: 'Check SigNoz — user.id / user.role / user.type are on the span and logs',
  });
});

app.get('/secured/profile', fakeAuth, (req, res) => {
  const span = trace.getSpan(context.active());
  const user = getUser();
  res.json({
    service: 'express',
    traceId: span?.spanContext().traceId ?? 'none',
    user,
    message: `Hello, ${user?.id ?? 'stranger'}! Your role is ${user?.role ?? 'unknown'}.`,
  });
});

app.post('/secured/action', fakeAuth, (req, res) => {
  const span = trace.getSpan(context.active());
  const user = getUser();
  res.json({
    service: 'express',
    traceId: span?.spanContext().traceId ?? 'none',
    user,
    performed: req.body,
    result: 'ok',
  });
});

// ── Proxy Endpoints (for backend-to-backend trace propagation tests) ─────────

app.get('/proxy/nestjs', async (req, res) => {
  const span = trace.getSpan(context.active());
  const traceId = span?.spanContext().traceId ?? 'none';
  req.log.info({ step: 'proxy-nestjs', traceId }, 'Proxying to nestjs-app');
  try {
    const fwdHeaders: Record<string, string> = {};
    if (req.headers['x-test-run-id']) fwdHeaders['x-test-run-id'] = String(req.headers['x-test-run-id']);
    const upstream = await fetch('http://nestjs-app:3010/hello', { headers: fwdHeaders });
    const downstream = await upstream.json();
    res.json({ service: 'express', traceId, downstream });
  } catch (err) {
    res.status(502).json({ service: 'express', error: err instanceof Error ? err.message : 'upstream failed' });
  }
});

app.get('/proxy/laravel', async (req, res) => {
  const span = trace.getSpan(context.active());
  const traceId = span?.spanContext().traceId ?? 'none';
  req.log.info({ step: 'proxy-laravel', traceId }, 'Proxying to laravel-app');
  try {
    const fwdHeaders: Record<string, string> = {};
    if (req.headers['x-test-run-id']) fwdHeaders['x-test-run-id'] = String(req.headers['x-test-run-id']);
    const upstream = await fetch('http://laravel-app:8080/api/hello', { headers: fwdHeaders });
    const downstream = await upstream.json();
    res.json({ service: 'express', traceId, downstream });
  } catch (err) {
    res.status(502).json({ service: 'express', error: err instanceof Error ? err.message : 'upstream failed' });
  }
});

/**
 * Debug endpoint — returns which OTel propagation headers were received.
 * Only for playground/development. Never expose in production.
 */
app.get('/debug/headers', (req, res) => {
  const span = trace.getSpan(context.active());
  res.json({
    traceparent: !!req.headers['traceparent'],
    tracestate: !!req.headers['tracestate'],
    baggage: !!req.headers['baggage'],
    'x-test-run-id': req.headers['x-test-run-id'] ?? null,
    traceId: span?.spanContext().traceId ?? null,
    received: {
      traceparent: req.headers['traceparent'] ?? null,
      tracestate: req.headers['tracestate'] ?? null,
      baggage: req.headers['baggage'] ?? null,
    },
  });
});

const port = Number(process.env.PORT) || 3020;
app.listen(port, () => {
  console.log(`Express playground listening on :${port}`);
});

// ── Admin endpoints (runtime profile switching) ───────────────────────────

function serializeProfile(resolved: ReturnType<typeof resolveProfile>) {
  return {
    profile: resolved.profile,
    captureRequestBody: resolved.captureRequestBody,
    captureResponseBody: resolved.captureResponseBody,
    logRequestBody: resolved.logRequestBody,
    logResponseBody: resolved.logResponseBody,
    logPayloadMode: resolved.logPayloadMode,
    ignoreRoutes: resolved.ignoreRoutes.map((r) => r.source),
    logBodyIgnoreRoutes: resolved.logBodyIgnoreRoutes.map((r) => r.source),
    logBodyOnlyRoutes: resolved.logBodyOnlyRoutes.map((r) => r.source),
  };
}

app.get('/admin/config', (_req, res) => {
  const captureBodyRaw = process.env.OTEL_CAPTURE_BODY;
  const captureResponseRaw = process.env.OTEL_CAPTURE_RESPONSE;
  res.json({
    service: 'express',
    profile: process.env.OTEL_PROFILE || 'minimal',
    captureBody: captureBodyRaw === 'true' ? true : captureBodyRaw === 'false' ? false : null,
    captureResponse:
      captureResponseRaw === 'true' ? true : captureResponseRaw === 'false' ? false : null,
    logDestination: process.env.LOG_DESTINATION || 'both',
  });
});

app.put('/admin/config', (req, res) => {
  const body = req.body as {
    profile?: string;
    captureBody?: boolean | null;
    captureResponse?: boolean | null;
    logDestination?: string;
    logPayloadMode?: string;
  };
  if (body.profile !== undefined) process.env.OTEL_PROFILE = body.profile;
  if (body.captureBody !== undefined && body.captureBody !== null) {
    process.env.OTEL_CAPTURE_BODY = String(body.captureBody);
  } else if (body.captureBody === null) {
    delete process.env.OTEL_CAPTURE_BODY;
  }
  if (body.captureResponse !== undefined && body.captureResponse !== null) {
    process.env.OTEL_CAPTURE_RESPONSE = String(body.captureResponse);
  } else if (body.captureResponse === null) {
    delete process.env.OTEL_CAPTURE_RESPONSE;
  }
  if (body.logDestination !== undefined) process.env.LOG_DESTINATION = body.logDestination;
  if (body.logPayloadMode !== undefined) process.env.OTEL_LOG_PAYLOAD_MODE = body.logPayloadMode;

  const resolved = resolveProfile();
  process.env.OTEL_RESOLVED_PROFILE = JSON.stringify(serializeProfile(resolved));
  _resetRuntimeProfileCache();

  const captureBodyRaw = process.env.OTEL_CAPTURE_BODY;
  const captureResponseRaw = process.env.OTEL_CAPTURE_RESPONSE;
  res.json({
    service: 'express',
    profile: process.env.OTEL_PROFILE || 'minimal',
    captureBody: captureBodyRaw === 'true' ? true : captureBodyRaw === 'false' ? false : null,
    captureResponse:
      captureResponseRaw === 'true' ? true : captureResponseRaw === 'false' ? false : null,
    logDestination: process.env.LOG_DESTINATION || 'both',
  });
});

app.get('/admin/debug', (_req, res) => {
  const runtime = getRuntimeProfile();
  res.json({
    service: 'express',
    processEnv: {
      OTEL_PROFILE: process.env.OTEL_PROFILE,
      OTEL_CAPTURE_BODY: process.env.OTEL_CAPTURE_BODY,
      OTEL_CAPTURE_RESPONSE: process.env.OTEL_CAPTURE_RESPONSE,
      OTEL_RESOLVED_PROFILE: process.env.OTEL_RESOLVED_PROFILE,
      LOG_DESTINATION: process.env.LOG_DESTINATION,
    },
    runtimeProfile: {
      profile: runtime.profile,
      captureRequestBody: runtime.captureRequestBody,
      captureResponseBody: runtime.captureResponseBody,
      logRequestBody: runtime.logRequestBody,
      logResponseBody: runtime.logResponseBody,
      logPayloadMode: runtime.logPayloadMode,
    },
  });
});
