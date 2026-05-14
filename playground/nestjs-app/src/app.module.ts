import { Module } from '@nestjs/common';
import { OtelModule } from '@haocruz/opentelemetry/nestjs';
import { AppController } from './app.controller';
import { AdminController } from './admin.controller';
import { SecuredController } from './secured.controller';

@Module({
  imports: [
    OtelModule.forRoot({
      extraSensitiveFields: ['cpf', 'rg'],
      extraAllowedHeaders: ['x-user-id', 'x-user-role'],
    }),
  ],
  controllers: [AppController, AdminController, SecuredController],
})
export class AppModule {}
