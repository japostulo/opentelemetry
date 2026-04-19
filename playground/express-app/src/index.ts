import { setupTracing, trace, context } from '@haocruz/opentelemetry';

setupTracing({ serviceName: 'playground-express' });

import express from 'express';
import { createTraceMiddleware, createPinoMiddleware } from '@haocruz/opentelemetry/express';

const app = express();

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

const port = Number(process.env.PORT) || 3020;
app.listen(port, () => {
  console.log(`Express playground listening on :${port}`);
});
