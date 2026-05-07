import { Module } from '@nestjs/common';
import { HaocLoggerModule } from '@haocruz/opentelemetry/nestjs';
import { AppController } from './app.controller';
import { AdminController } from './admin.controller';

@Module({
  imports: [
    HaocLoggerModule.forRoot({
      extraSensitiveFields: ['cpf', 'rg'],
    }),
  ],
  controllers: [AppController, AdminController],
})
export class AppModule {}
