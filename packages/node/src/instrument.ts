/**
 * Zero-config auto-instrument entry point.
 *
 * Import this as the **very first** line of your application entry point.
 * It reads all configuration from environment variables (OTEL_SERVICE_NAME,
 * OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_ENVIRONMENT, OTEL_PROFILE, etc.) and
 * initialises the OpenTelemetry SDK before any framework code runs.
 *
 * @example
 * ```ts
 * // main.ts — must be the first import
 * import '@haocruz/opentelemetry/instrument';
 *
 * import { NestFactory } from '@nestjs/core';
 * // ...
 * ```
 */
import { setupTracing } from './tracing/setup';

setupTracing();
