import { INestApplication, ValidationPipe, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { OTEL_CORS_CONFIG, OTEL_CORS_ALLOWED_HEADERS, OTEL_CORS_EXPOSED_HEADERS, type CorsConfig } from './logger.module';
import { setupTracing } from '../tracing/setup';
import type { OtelConfig } from '../tracing/types';

export interface AppOptions {
  /**
   * CORS origin(s). Pass `true` for any origin, a string, an array.
   * @default true
   */
  corsOrigin?: boolean | string | string[];
}
/** @deprecated Use {@link AppOptions} */
export type HaocAppOptions = AppOptions;

/**
 * @deprecated No longer needed. Use the standard NestJS pattern instead:
 *
 * ```ts
 * import { setupTracing } from '@haocruz/opentelemetry';
 * setupTracing({ serviceName: 'my-api' });
 *
 * import { NestFactory } from '@nestjs/core';
 * import { configureApp } from '@haocruz/opentelemetry/nestjs';
 * import { AppModule } from './app.module';
 *
 * async function bootstrap() {
 *   const app = await NestFactory.create(AppModule, { bufferLogs: true });
 *   configureApp(app);
 *   await app.listen(Number(process.env.PORT) || 3000);
 * }
 * bootstrap();
 * ```
 */
export interface HaocBootstrapConfig extends OtelConfig {
  corsOrigin?: boolean | string | string[];
  port?: number;
  enableValidation?: boolean;
  beforeListen?: (app: INestApplication) => void | Promise<void>;
}

/**
 * Applies OpenTelemetry standard configuration to a NestJS application:
 *
 * 1. `app.useLogger()` — routes all Nest logs through Pino
 * 2. `app.enableCors()` — with tracing headers (allowedHeaders / exposedHeaders)
 *
 * Call this right after `NestFactory.create()`:
 * ```ts
 * const app = await NestFactory.create(AppModule, { bufferLogs: true });
 * configureApp(app, { corsOrigin: env.get('ALLOWED_DOMAINS')?.split(',') });
 * ```
 */
export function configureApp(
  app: INestApplication,
  options?: AppOptions,
): void {
  // 1. Use Pino as the application logger
  app.useLogger(app.get(Logger));

  // 2. Enable CORS with tracing headers from the module config
  let corsConfig: CorsConfig;
  try {
    corsConfig = app.get<CorsConfig>(OTEL_CORS_CONFIG);
  } catch {
    // Module not registered — use defaults
    corsConfig = {
      allowedHeaders: [...OTEL_CORS_ALLOWED_HEADERS],
      exposedHeaders: [...OTEL_CORS_EXPOSED_HEADERS],
    };
  }

  app.enableCors({
    origin: options?.corsOrigin ?? true,
    allowedHeaders: corsConfig.allowedHeaders,
    exposedHeaders: corsConfig.exposedHeaders,
  });
}
/** @deprecated Use {@link configureApp} */
export const configureHaocApp = configureApp;

/**
 * @deprecated Use the standard NestJS pattern with `setupTracing` + `NestFactory.create` + `configureApp`.
 *
 * Zero-config NestJS bootstrap — sets up tracing, creates the app,
 * configures CORS + Pino logger, and starts listening.
 *
 * @example
 * ```ts
 * // Preferred: standard NestJS pattern
 * import { setupTracing } from '@haocruz/opentelemetry';
 * setupTracing({ serviceName: 'my-api' });
 *
 * import { NestFactory } from '@nestjs/core';
 * import { configureApp } from '@haocruz/opentelemetry/nestjs';
 * import { AppModule } from './app.module';
 *
 * async function bootstrap() {
 *   const app = await NestFactory.create(AppModule, { bufferLogs: true });
 *   configureApp(app);
 *   await app.listen(Number(process.env.PORT) || 3000);
 * }
 * bootstrap();
 * ```
 */
export async function bootstrapHaocApp(
  appModule: Type,
  config: HaocBootstrapConfig,
): Promise<INestApplication> {
  setupTracing(config);

  const app = await NestFactory.create(appModule, { bufferLogs: true });

  const corsOrigin =
    config.corsOrigin ??
    (process.env.ALLOWED_DOMAINS
      ? process.env.ALLOWED_DOMAINS.split(',')
      : true);
  configureApp(app, { corsOrigin });

  if (config.enableValidation !== false) {
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
  }

  if (config.beforeListen) {
    await config.beforeListen(app);
  }

  const port = config.port ?? (Number(process.env.PORT) || 3000);
  await app.listen(port);

  return app;
}
