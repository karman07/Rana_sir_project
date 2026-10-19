import { Interview, InterviewSchema } from '../interviews/schemas/interview.schema';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApplicationsModule } from '../applications/applications.module';
import { JobsModule } from '../jobs/jobs.module';
import { CandidateRequest, CandidateRequestSchema } from './schemas/candidate-request.schema';
import { RecruiterReviewService } from './recruiter-review.service';
import { RecruiterReviewController, ScreeningController } from './screening.controller';
import { ScreeningService } from './screening.service';

@Module({
  imports: [JobsModule, ApplicationsModule, MongooseModule.forFeature([{ name: CandidateRequest.name, schema: CandidateRequestSchema }, { name: Interview.name, schema: InterviewSchema }])],
  controllers: [ScreeningController, RecruiterReviewController],
  providers: [ScreeningService, RecruiterReviewService],
  exports: [MongooseModule, ScreeningService, RecruiterReviewService],
})
export class ScreeningModule {}
