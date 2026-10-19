import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators';

@Controller('health')
@Public()
@SkipThrottle()
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  check() {
    const db = this.connection.readyState === 1 ? 'up' : 'down';
    return { status: db === 'up' ? 'ok' : 'degraded', service: 'recruitment-api', db, time: new Date().toISOString() };
  }
}
