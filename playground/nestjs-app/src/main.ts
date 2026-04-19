import { bootstrapHaocApp } from '@haocruz/opentelemetry/nestjs';
import { AppModule } from './app.module';

bootstrapHaocApp(AppModule, {
  serviceName: 'playground-nestjs',
  port: 3010,
  enableValidation: false,
});
