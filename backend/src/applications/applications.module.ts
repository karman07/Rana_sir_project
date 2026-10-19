import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Interview, InterviewSchema } from '../interviews/schemas/interview.schema';
import { JobsModule } from '../jobs/jobs.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { RecruitmentWorkflowService } from './recruitment-workflow.service';

/** The Application model itself is registered (and exported) by DocumentsModule, which needs it for access checks. */
@Module({
  imports: [JobsModule, MongooseModule.forFeature([{ name: Interview.name, schema: InterviewSchema }])],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, RecruitmentWorkflowService],
  exports: [ApplicationsService, RecruitmentWorkflowService],
})
export class ApplicationsModule {}
