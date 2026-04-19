import { INestApplication, ValidationPipe, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { HAOC_CORS_CONFIG, HAOC_CORS_ALLOWED_HEADERS, HAOC_CORS_EXPOSED_HEADERS, type HaocCorsConfig } from './logger.module';
import { setupTracing } from '../tracing/setup';
import type { HaocTelemetryConfig } from '../tracing/types';

export interface HaocAppOptions {
  /**
   * CORS origin(s). Pass `true` for any origin, a string, an array.
   * @default true
   */
  corsOrigin?: boolean | string | string[];
}

export interface HaocBootstrapConfig extends HaocTelemetryConfig {
  /**
   * CORS origin(s). Pass `true` for any origin, a string, an array.
   * @default reads from ALLOWED_DOMAINS env var (comma-separated), fallback true
   */
  corsOrigin?: boolean | string | string[];

  /**
   * Port to listen on.
   * @default PORT env var || 3000
   */
  port?: number;

  /**
   * Enable ValidationPipe globally with transform: true.
   * @default true
   */
  enableValidation?: boolean;

  /**
   * Callback to apply additional configuration to the app
   * before it starts listening.
   */
  beforeListen?: (app: INestApplication) => void | Promise<void>;
}

/**
 * Applies the HAOC standard configuration to a NestJS application:
 *
 * 1. `app.useLogger()` — routes all Nest logs through Pino
 * 2. `app.enableCors()` — with tracing headers (allowedHeaders / exposedHeaders)
 *
 * Call this right after `NestFactory.create()`:
 * ```ts
 * const app = await NestFactory.create(AppModule, { bufferLogs: true });
 * configureHaocApp(app, { corsOrigin: env.get('ALLOWED_DOMAINS')?.split(',') });
 * ```
 */
export function configureHaocApp(
  app: INestApplication,
  options?: HaocAppOptions,
): void {
  // 1. Use Pino as the application logger
  app.useLogger(app.get(Logger));

  // 2. Enable CORS with tracing headers from the module config
  let corsConfig: HaocCorsConfig;
  try {
    corsConfig = app.get<HaocCorsConfig>(HAOC_CORS_CONFIG);
  } catch {
    // Module not registered — use defaults
    corsConfig = {
      allowedHeaders: [...HAOC_CORS_ALLOWED_HEADERS],
      exposedHeaders: [...HAOC_CORS_EXPOSED_HEADERS],
    };
  }

  app.enableCors({
    origin: options?.corsOrigin ?? true,
    allowedHeaders: corsConfig.allowedHeaders,
    exposedHeaders: corsConfig.exposedHeaders,
  });
}

/**
 * Zero-config NestJS bootstrap — sets up tracing, creates the app,
 * configures CORS + Pino logger, and starts listening.
 *
 * This is the recommended way to bootstrap a HAOC NestJS application.
 * One line in your `main.ts`:
 *
 * @example
 * ```ts
 * import { bootstrapHaocApp } from '@haocruz/opentelemetry/nestjs';
 * import { AppModule } from './app.module';
 *
 * bootstrapHaocApp(AppModule, { serviceName: 'totem-api' });
 * ```
 *
 * @example With custom configuration:
 * ```ts
 * bootstrapHaocApp(AppModule, {
 *   serviceName: 'totem-api',
 *   corsOrigin: ['https://totem.haoc.net'],
 *   port: 3001,
 *   beforeListen: (app) => {
 *     app.useGlobalPipes(new ValidationPipe({ transform: true }));
 *   },
 * });
 * ```
 */
export async function bootstrapHaocApp(
  appModule: Type,
  config: HaocBootstrapConfig,
): Promise<INestApplication> {
  // 1. Setup tracing FIRST — before any imports are resolved
  setupTracing(config);

  // 2. Create the NestJS app with buffered logs
  const app = await NestFactory.create(appModule, { bufferLogs: true });

  // 3. Apply HAOC standard configuration
  const corsOrigin =
    config.corsOrigin ??
    (process.env.ALLOWED_DOMAINS
      ? process.env.ALLOWED_DOMAINS.split(',')
      : true);
  configureHaocApp(app, { corsOrigin });

  // 4. Enable validation pipe by default
  if (config.enableValidation !== false) {
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
  }

  // 5. Custom configuration hook
  if (config.beforeListen) {
    await config.beforeListen(app);
  }

  // 6. Start listening
  const port = config.port ?? (Number(process.env.PORT) || 3000);
  await app.listen(port);

  return app;
}
