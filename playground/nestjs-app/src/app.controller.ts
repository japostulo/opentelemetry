import {
  Controller, Get, Post, Body, Req,
  HttpException, HttpStatus, Query,
} from '@nestjs/common';
import type { IncomingMessage } from 'http';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { trace, context, SpanStatusCode, identifyUser, getUser } from '@haocruz/opentelemetry';

@Controller()
export class AppController {
  constructor(
    @InjectPinoLogger(AppController.name)
    private readonly logger: PinoLogger,
  ) {}

  @Get('hello')
  hello() {
    const span = trace.getSpan(context.active());
    const traceId = span?.spanContext().traceId ?? 'none';

    this.logger.info({ step: 'handler', traceId }, 'Processing /hello');

    return {
      service: 'nestjs',
      traceId,
      message: 'Hello from NestJS playground!',
    };
  }

  /** Web → NestJS → Express → Laravel — full distributed chain. */
  @Get('chain')
  async chain(@Req() req: IncomingMessage & { headers: Record<string, string | string[] | undefined> }) {
    const span = trace.getSpan(context.active());
    const traceId = span?.spanContext().traceId ?? 'none';

    this.logger.info({ step: 'fetching-downstream', traceId }, 'Chain: calling express-app');

    const fwdHeaders: Record<string, string> = {};
    if (req.headers['x-test-run-id']) fwdHeaders['x-test-run-id'] = String(req.headers['x-test-run-id']);

    const res = await fetch('http://express-app:3020/chain', { headers: fwdHeaders });
    const downstream = await res.json();

    this.logger.info({ step: 'downstream-received', status: res.status, traceId }, 'Chain: response received');

    return { service: 'nestjs', traceId, downstream };
  }

  /** NestJS → Laravel (direct, skip Express). */
  @Get('chain-laravel')
  async chainLaravel() {
    const span = trace.getSpan(context.active());
    const traceId = span?.spanContext().traceId ?? 'none';

    const res = await fetch('http://laravel-app:8080/api/hello');
    const downstream = await res.json();

    return { service: 'nestjs', traceId, downstream };
  }

  /** Simulates a 4xx client error. */
  @Get('error-4xx')
  error4xx() {
    throw new HttpException(
      { error: 'Bad Request', detail: 'Missing required field: cpf' },
      HttpStatus.BAD_REQUEST,
    );
  }

  /** Simulates a 5xx server error (e.g. DB down). */
  @Get('error-5xx')
  error5xx() {
    throw new HttpException(
      { error: 'Internal Server Error', detail: 'Database connection refused' },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  /** Calls upstream that will fail — tests error propagation through chain. */
  @Get('chain-error')
  async chainError() {
    const span = trace.getSpan(context.active());
    const traceId = span?.spanContext().traceId ?? 'none';

    const res = await fetch('http://express-app:3020/error-5xx');
    if (!res.ok) {
      span?.setStatus({ code: SpanStatusCode.ERROR, message: `Upstream ${res.status}` });
      span?.setAttribute('error.upstream_status', res.status);
      throw new HttpException(
        { error: 'Bad Gateway', detail: 'Express upstream failed', upstreamStatus: res.status },
        HttpStatus.BAD_GATEWAY,
      );
    }
    return { service: 'nestjs', traceId, downstream: await res.json() };
  }

  /** Slow endpoint — configurable delay for latency testing. */
  @Get('slow')
  async slow(@Query('ms') ms?: string) {
    const delay = Math.min(Number(ms) || 2000, 10000);
    const span = trace.getSpan(context.active());
    span?.setAttribute('test.delay_ms', delay);

    await new Promise(r => setTimeout(r, delay));

    return {
      service: 'nestjs',
      traceId: span?.spanContext().traceId ?? 'none',
      delayed: delay,
    };
  }

  @Post('echo')
  echo(@Body() body: Record<string, unknown>) {
    const span = trace.getSpan(context.active());
    const traceId = span?.spanContext().traceId ?? 'none';

    this.logger.info({ step: 'echo', traceId, bodyKeys: Object.keys(body) }, 'Processing /echo');

    return {
      service: 'nestjs',
      traceId,
      received: body,
    };
  }

  @Get('identity')
  identity() {
    const span = trace.getSpan(context.active());

    // Demonstrates: identifyUser() called INSIDE the handler.
    // The span gets user attrs immediately (written directly to span).
    // However, log attributes won't include user attrs because RxJS's
    // tap() runs in a separate async context created before identifyUser().
    //
    // ⚠️  BEST PRACTICE: call identifyUser() in a guard/middleware BEFORE
    //     the handler — that way BOTH spans AND logs get user attributes.
    //     See SecuredController + FakeAuthGuard for the recommended pattern.
    identifyUser({ id: 'usr_demo_123', role: 'operator', type: 'authenticated' });

    return {
      service: 'nestjs',
      traceId: span?.spanContext().traceId ?? 'none',
      user: getUser(),
      tip: 'Check SigNoz — user.id / user.role / user.type are on the span. For logs too, use a guard (see /secured routes).',
    };
  }

  /** Proxy: NestJS → Express /hello (for backend-to-backend trace propagation tests). */
  @Get('proxy/express')
  async proxyExpress(@Req() req: IncomingMessage & { headers: Record<string, string | string[] | undefined> }) {
    const span = trace.getSpan(context.active());
    const traceId = span?.spanContext().traceId ?? 'none';

    this.logger.info({ step: 'proxy-express', traceId }, 'Proxying to express-app');

    const fwdHeaders: Record<string, string> = {};
    if (req.headers['x-test-run-id']) fwdHeaders['x-test-run-id'] = String(req.headers['x-test-run-id']);

    const res = await fetch('http://express-app:3020/hello', { headers: fwdHeaders });
    const downstream = await res.json();

    return { service: 'nestjs', traceId, downstream };
  }

  /** Proxy: NestJS → Laravel /api/hello (for backend-to-backend trace propagation tests). */
  @Get('proxy/laravel')
  async proxyLaravel(@Req() req: IncomingMessage & { headers: Record<string, string | string[] | undefined> }) {
    const span = trace.getSpan(context.active());
    const traceId = span?.spanContext().traceId ?? 'none';

    this.logger.info({ step: 'proxy-laravel', traceId }, 'Proxying to laravel-app');

    const fwdHeaders: Record<string, string> = {};
    if (req.headers['x-test-run-id']) fwdHeaders['x-test-run-id'] = String(req.headers['x-test-run-id']);

    const res = await fetch('http://laravel-app:8080/api/hello', { headers: fwdHeaders });
    const downstream = await res.json();

    return { service: 'nestjs', traceId, downstream };
  }

  /**
   * Debug endpoint — returns which OTel propagation headers were received.
   * Only for playground/development. Never expose in production.
   */
  @Get('debug/headers')
  debugHeaders(@Req() req: IncomingMessage & { headers: Record<string, string | string[] | undefined> }) {
    return {
      traceparent: !!req.headers['traceparent'],
      tracestate: !!req.headers['tracestate'],
      baggage: !!req.headers['baggage'],
      'x-test-run-id': req.headers['x-test-run-id'] ?? null,
      traceId: trace.getSpan(context.active())?.spanContext().traceId ?? null,
      received: {
        traceparent: req.headers['traceparent'] ?? null,
        tracestate: req.headers['tracestate'] ?? null,
        baggage: req.headers['baggage'] ?? null,
      },
    };
  }
}
