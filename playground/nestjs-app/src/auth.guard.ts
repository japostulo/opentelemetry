import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { identifyUser } from '@haocruz/opentelemetry';

/**
 * Simulates JWT/API-key auth for playground tests.
 *
 * In a real app this would verify a JWT and extract the user.
 * Here it just reads the `x-user-id` header (and optionally `x-user-role`).
 *
 * Usage:
 *   curl -H "x-user-id: 42" http://localhost:3010/secured/profile
 *   curl -H "x-user-id: 99" -H "x-user-role: admin" http://localhost:3010/secured/profile
 */
@Injectable()
export class FakeAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: { id: string; role: string };
    }>();

    const userId = req.headers['x-user-id'];
    if (!userId) {
      throw new UnauthorizedException('Missing x-user-id header');
    }

    const role = req.headers['x-user-role'] ?? 'viewer';

    // ── The single call that matters ───────────────────────────────────
    // identifyUser stores the identity in the request-scoped async context
    // AND writes user.id / user.role / user.type directly to the active span.
    identifyUser({ id: userId, role, type: 'authenticated' });

    // Attach to request so controllers can read it
    req.user = { id: userId, role };
    return true;
  }
}
