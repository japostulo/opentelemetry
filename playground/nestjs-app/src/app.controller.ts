import {
  Controller, Get, Post, Body,
  HttpException, HttpStatus, Query,
} from '@nestjs/common';
import { trace, context, SpanStatusCode, setUser, getUser } from '@haocruz/opentelemetry';

@Controller()
export class AppController {
  @Get('hello')
  hello() {
    const span = trace.getSpan(context.active());
    return {
      service: 'nestjs',
      traceId: span?.spanContext().traceId ?? 'none',
      message: 'Hello from NestJS playground!',
    };
  }

  /** Web → NestJS → Express → Laravel — full distributed chain. */
  @Get('chain')
  async chain() {
    const span = trace.getSpan(context.active());
    const traceId = span?.spanContext().traceId ?? 'none';

    const res = await fetch('http://express-app:3020/chain');
    const downstream = await res.json();

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
    return {
      service: 'nestjs',
      traceId: span?.spanContext().traceId ?? 'none',
      received: body,
    };
  }

  @Get('identity')
  identity() {
    const span = trace.getSpan(context.active());

    setUser({ id: 'user-123', role: 'admin', type: 'authenticated' });
    const user = getUser();

    return {
      service: 'nestjs',
      traceId: span?.spanContext().traceId ?? 'none',
      user,
    };
  }
}
