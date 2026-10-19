import { Controller, Get, Param, Query } from '@nestjs/common';
import { Role } from '@rms/shared';
import { Roles } from '../auth/decorators';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { CandidatePoolQueryDto, CandidatePoolService } from './candidate-pool.service';

@Controller('candidate-pool')
@Roles(Role.ADMIN)
export class CandidatePoolController {
  constructor(private readonly service: CandidatePoolService) {}
  @Get() list(@Query() q: CandidatePoolQueryDto) { return this.service.list(q); }
  @Get(':id') get(@Param('id', ParseObjectIdPipe) id: string) { return this.service.get(id); }
}
