import { setupTracing, trace, context, resolveProfile, _resetRuntimeProfileCache, getRuntimeProfile } from '@haocruz/opentelemetry';

setupTracing({
  serviceName: 'playground-express',
  // Exercise the new minimal profile so /favicon.ico, /health and static
  // assets are dropped by the SDK before reaching SigNoz.
  profile: 'minimal',
});

import express from 'express';
import { createTraceMiddleware, createPinoMiddleware } from '@haocruz/opentelemetry/express';

const app = express();

// ── CORS (playground — allow all origins) ─────────────────────────────────
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, traceparent, tracestate, baggage, X-Request-ID',
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

app.get('/hello', (_req, res) => {
  const span = trace.getSpan(context.active());
  res.json({
    service: 'express',
    traceId: span?.spanContext().traceId ?? 'none',
    message: 'Hello from Express playground!',
  });
});

app.get('/chain', async (_req, res) => {
  const span = trace.getSpan(context.active());
  const traceId = span?.spanContext().traceId ?? 'none';

  try {
    const upstream = await fetch('http://laravel-app:8080/api/hello');
    const downstream = await upstream.json();
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
    ignoreRoutes: resolved.ignoreRoutes.map((r) => r.source),
    logBodyIgnoreRoutes: resolved.logBodyIgnoreRoutes.map((r) => r.source),
    logBodyOnlyRoutes: resolved.logBodyOnlyRoutes.map((r) => r.source),
  };
}

app.get('/admin/config', (_req, res) => {
  const captureBodyRaw = process.env.HAOC_OTEL_CAPTURE_BODY;
  const captureResponseRaw = process.env.HAOC_OTEL_CAPTURE_RESPONSE;
  res.json({
    service: 'express',
    profile: process.env.HAOC_OTEL_PROFILE || 'minimal',
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
  };
  if (body.profile !== undefined) process.env.HAOC_OTEL_PROFILE = body.profile;
  if (body.captureBody !== undefined && body.captureBody !== null) {
    process.env.HAOC_OTEL_CAPTURE_BODY = String(body.captureBody);
  } else if (body.captureBody === null) {
    delete process.env.HAOC_OTEL_CAPTURE_BODY;
  }
  if (body.captureResponse !== undefined && body.captureResponse !== null) {
    process.env.HAOC_OTEL_CAPTURE_RESPONSE = String(body.captureResponse);
  } else if (body.captureResponse === null) {
    delete process.env.HAOC_OTEL_CAPTURE_RESPONSE;
  }
  if (body.logDestination !== undefined) process.env.LOG_DESTINATION = body.logDestination;

  const resolved = resolveProfile();
  process.env.HAOC_OTEL_RESOLVED_PROFILE = JSON.stringify(serializeProfile(resolved));
  _resetRuntimeProfileCache();

  const captureBodyRaw = process.env.HAOC_OTEL_CAPTURE_BODY;
  const captureResponseRaw = process.env.HAOC_OTEL_CAPTURE_RESPONSE;
  res.json({
    service: 'express',
    profile: process.env.HAOC_OTEL_PROFILE || 'minimal',
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
      HAOC_OTEL_PROFILE: process.env.HAOC_OTEL_PROFILE,
      HAOC_OTEL_CAPTURE_BODY: process.env.HAOC_OTEL_CAPTURE_BODY,
      HAOC_OTEL_CAPTURE_RESPONSE: process.env.HAOC_OTEL_CAPTURE_RESPONSE,
      HAOC_OTEL_RESOLVED_PROFILE: process.env.HAOC_OTEL_RESOLVED_PROFILE,
      LOG_DESTINATION: process.env.LOG_DESTINATION,
    },
    runtimeProfile: {
      profile: runtime.profile,
      captureRequestBody: runtime.captureRequestBody,
      captureResponseBody: runtime.captureResponseBody,
      logRequestBody: runtime.logRequestBody,
      logResponseBody: runtime.logResponseBody,
    },
  });
});
