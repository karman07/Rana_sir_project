import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Job, JobSchema } from '../jobs/schemas/job.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { CommissionRulesController } from './commission-rules.controller';
import { CommissionRulesService } from './commission-rules.service';
import { CommissionRuleDoc, CommissionRuleSchema } from './schemas/commission-rule.schema';

@Module({
  imports: [MongooseModule.forFeature([
    { name: CommissionRuleDoc.name, schema: CommissionRuleSchema },
    { name: Job.name, schema: JobSchema },
    { name: User.name, schema: UserSchema },
  ])],
  controllers: [CommissionRulesController],
  providers: [CommissionRulesService],
  exports: [CommissionRulesService, MongooseModule],
})
export class CommissionsModule {}
