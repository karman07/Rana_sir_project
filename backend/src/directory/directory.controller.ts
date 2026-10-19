import { Controller, Get, Param, Query } from '@nestjs/common';
import { Role } from '@rms/shared';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { DirectoryService } from './directory.service';

class SearchQueryDto { @IsOptional() @IsString() @MaxLength(300) q?: string }

@Controller()
export class DirectoryController {
  constructor(private readonly service: DirectoryService) {}

  @Roles(Role.ADMIN) @Get('directory/recruiters/:id')
  recruiter(@Param('id', ParseObjectIdPipe) id: string) { return this.service.recruiterProfile(id); }

  @Roles(Role.ADMIN) @Get('directory/companies/:id')
  company(@Param('id', ParseObjectIdPipe) id: string) { return this.service.companyProfile(id); }

  /** One search across everything the signed-in person may see. It never returns a record they could not open. */
  @Throttle({ default: { limit: () => Number(process.env.SEARCH_RATE_LIMIT ?? 60), ttl: 60_000 } }) @Get('search')
  search(@Query() q: SearchQueryDto, @CurrentUser() u: AuthUser) { return this.service.search(q.q ?? '', u); }
}
