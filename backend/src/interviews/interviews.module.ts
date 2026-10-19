import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApplicationsModule } from '../applications/applications.module';
import { JobsModule } from '../jobs/jobs.module';
import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';
import { InterviewFeedback, InterviewFeedbackSchema } from './schemas/interview-feedback.schema';
import { Interview, InterviewSchema } from './schemas/interview.schema';

@Module({
  imports: [JobsModule, ApplicationsModule, MongooseModule.forFeature([{ name: Interview.name, schema: InterviewSchema }, { name: InterviewFeedback.name, schema: InterviewFeedbackSchema }])],
  controllers: [InterviewsController],
  providers: [InterviewsService],
  exports: [MongooseModule, InterviewsService],
})
export class InterviewsModule {}
