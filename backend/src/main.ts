import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app);
  await app.listen(app.get<ConfigService<Env, true>>(ConfigService).get('PORT'));
}
void bootstrap();
