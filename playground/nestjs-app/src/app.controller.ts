import { Controller, Get, Post, Body } from '@nestjs/common';
import { trace, context, setUser, getUser } from '@haocruz/opentelemetry';

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

  @Get('chain')
  async chain() {
    const span = trace.getSpan(context.active());
    const traceId = span?.spanContext().traceId ?? 'none';

    const res = await fetch('http://express-app:3020/hello');
    const downstream = await res.json();

    return {
      service: 'nestjs',
      traceId,
      downstream,
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
