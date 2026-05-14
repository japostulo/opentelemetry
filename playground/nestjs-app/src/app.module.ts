import { Module } from '@nestjs/common';
import { HaocLoggerModule } from '@haocruz/opentelemetry/nestjs';
import { AppController } from './app.controller';
import { AdminController } from './admin.controller';
import { SecuredController } from './secured.controller';

@Module({
  imports: [
    HaocLoggerModule.forRoot({
      extraSensitiveFields: ['cpf', 'rg'],
      extraAllowedHeaders: ['x-user-id', 'x-user-role'],
    }),
  ],
  controllers: [AppController, AdminController, SecuredController],
})
export class AppModule {}
