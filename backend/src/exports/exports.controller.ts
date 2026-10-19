import { Controller, Get, Param, Query, Res, StreamableFile } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import { PERIODS } from '../analytics/periods';
import { CurrentUser, type AuthUser } from '../auth/decorators';
import { ExportsService } from './exports.service';

class ExportQueryDto {
  @IsOptional() @IsIn(['csv', 'xlsx']) format?: 'csv' | 'xlsx';
  @IsOptional() @IsIn([...PERIODS]) period?: string;
  @IsOptional() @IsString() @MaxLength(40) status?: string;
}

/** Downloads for working in a spreadsheet. What is in a file depends on who asks; the same rules as the pages apply. */
@Controller('exports')
export class ExportsController {
  constructor(private readonly service: ExportsService) {}

  @Throttle({ default: { limit: () => Number(process.env.EXPORT_RATE_LIMIT ?? 20), ttl: 60_000 } }) @Get(':dataset')
  async download(@Param('dataset') dataset: string, @Query() q: ExportQueryDto, @CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    const r = await this.service.export(dataset, q.format ?? 'csv', { period: q.period, status: q.status }, user);
    res.set({
      'Content-Type': r.mime, 'Content-Disposition': `attachment; filename="${r.filename}"`, 'Content-Length': String(r.body.length), 'Cache-Control': 'private, no-store',
      'X-Row-Count': String(r.rows), ...(r.truncated ? { 'X-Truncated': 'true' } : {}), 'Access-Control-Expose-Headers': 'X-Row-Count, X-Truncated, Content-Disposition',
    });
    return new StreamableFile(r.body);
  }
}
