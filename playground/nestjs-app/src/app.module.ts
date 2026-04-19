import { Module } from '@nestjs/common';
import { HaocLoggerModule } from '@haocruz/opentelemetry/nestjs';
import { AppController } from './app.controller';

@Module({
  imports: [
    HaocLoggerModule.forRoot({
      extraSensitiveFields: ['cpf', 'rg'],
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}
