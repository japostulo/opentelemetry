import { Controller, Get, Body, Put } from '@nestjs/common';
import { resolveProfile, _resetRuntimeProfileCache, getRuntimeProfile } from '@haocruz/opentelemetry';

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

@Controller('admin')
export class AdminController {
  @Get('config')
  getConfig() {
    const profile = process.env.HAOC_OTEL_PROFILE || 'minimal';
    const captureBodyRaw = process.env.HAOC_OTEL_CAPTURE_BODY;
    const captureResponseRaw = process.env.HAOC_OTEL_CAPTURE_RESPONSE;

    return {
      service: 'nestjs',
      profile,
      captureBody: captureBodyRaw === 'true' ? true : captureBodyRaw === 'false' ? false : null,
      captureResponse:
        captureResponseRaw === 'true' ? true : captureResponseRaw === 'false' ? false : null,
      logDestination: process.env.LOG_DESTINATION || 'both',
    };
  }

  @Get('debug')
  getDebug() {
    const runtime = getRuntimeProfile();
    return {
      service: 'nestjs',
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
    };
  }

  @Put('config')
  updateConfig(
    @Body()
    body: {
      profile?: string;
      captureBody?: boolean | null;
      captureResponse?: boolean | null;
      logDestination?: string;
    },
  ) {
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

    // Re-resolve the profile with the new env vars and update the cached env var
    const resolved = resolveProfile();
    process.env.HAOC_OTEL_RESOLVED_PROFILE = JSON.stringify(serializeProfile(resolved));

    // Clear the in-memory cache so the next request uses the new profile
    _resetRuntimeProfileCache();

    return this.getConfig();
  }
}
