import { setupTracing } from '@haocruz/opentelemetry';
setupTracing({ serviceName: 'playground-nestjs' });

import { NestFactory } from '@nestjs/core';
import { configureApp } from '@haocruz/opentelemetry/nestjs';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app);
  await app.listen(Number(process.env.PORT) || 3010);
}
bootstrap();
