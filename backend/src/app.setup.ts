import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Env } from './config/env';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { sanitizeMiddleware } from './common/middleware/sanitize.middleware';

/** Shared by main.ts and e2e tests so both exercise the same pipeline. */
export function configureApp(app: INestApplication) {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  // Behind nginx: take the visitor's address (rate limiting, audit trail) from X-Forwarded-For.
  if (config.get('NODE_ENV') === 'production') (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set('trust proxy', 1);
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.use(sanitizeMiddleware);
  app.enableCors({ origin: config.get('WEB_ORIGIN'), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: false } }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
}
