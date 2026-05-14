import {
  Controller, Get, Post, Body, UseGuards, Request,
} from '@nestjs/common';
import { trace, context, getUser } from '@haocruz/opentelemetry';
import { FakeAuthGuard } from './auth.guard';

interface AuthedRequest {
  user: { id: string; role: string };
}

/**
 * Secured routes — require the x-user-id header (FakeAuthGuard).
 *
 * Test cases:
 *   # Authenticated - viewer
 *   curl -H "x-user-id: usr_42" http://localhost:3010/secured/profile
 *
 *   # Authenticated - admin
 *   curl -H "x-user-id: usr_99" -H "x-user-role: admin" http://localhost:3010/secured/profile
 *
 *   # POST with body (user shows up on span + response log)
 *   curl -X POST http://localhost:3010/secured/action \
 *     -H "Content-Type: application/json" \
 *     -H "x-user-id: usr_42" \
 *     -d '{"action":"update_record","recordId":"rec_001"}'
 *
 *   # Missing auth → 401
 *   curl http://localhost:3010/secured/profile
 */
@Controller('secured')
@UseGuards(FakeAuthGuard)
export class SecuredController {
  @Get('profile')
  profile(@Request() req: AuthedRequest) {
    const span = trace.getSpan(context.active());
    const user = getUser(); // reads from AsyncLocalStorage

    return {
      service: 'nestjs',
      traceId: span?.spanContext().traceId ?? 'none',
      user,
      message: `Hello, ${user?.id ?? 'stranger'}! Your role is ${req.user.role}.`,
    };
  }

  @Post('action')
  action(
    @Request() req: AuthedRequest,
    @Body() body: Record<string, unknown>,
  ) {
    const span = trace.getSpan(context.active());
    const user = getUser();

    return {
      service: 'nestjs',
      traceId: span?.spanContext().traceId ?? 'none',
      user,
      performed: body,
      result: 'ok',
    };
  }

  @Get('chain-auth')
  async chainAuth(@Request() req: AuthedRequest) {
    const span = trace.getSpan(context.active());
    const user = getUser();

    // Forward the user identity header to downstream service
    const res = await fetch('http://express-app:3020/secured/profile', {
      headers: {
        'x-user-id': req.user.id,
        'x-user-role': req.user.role,
      },
    });
    const downstream = await res.json();

    return {
      service: 'nestjs',
      traceId: span?.spanContext().traceId ?? 'none',
      user,
      downstream,
    };
  }
}
