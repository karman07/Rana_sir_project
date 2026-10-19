import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobRequestsService } from './job-requests.service';
import { CommissionsModule } from '../commissions/commissions.module';
import { JobPricingService } from './job-pricing.service';
import { JobChangesService } from './job-changes.service';
import { JobChangesController, JobRequestsController, JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { JobChangeRequest, JobChangeRequestSchema } from './schemas/job-change-request.schema';
import { Application, ApplicationSchema } from '../applications/schemas/application.schema';
import { JobRequest, JobRequestSchema } from './schemas/job-request.schema';
import { Job, JobSchema } from './schemas/job.schema';

@Module({
  imports: [CommissionsModule, MongooseModule.forFeature([{ name: JobRequest.name, schema: JobRequestSchema }, { name: Job.name, schema: JobSchema }, { name: JobChangeRequest.name, schema: JobChangeRequestSchema }, { name: Application.name, schema: ApplicationSchema }])],
  controllers: [JobRequestsController, JobChangesController, JobsController],
  providers: [JobRequestsService, JobsService, JobChangesService, JobPricingService],
  exports: [MongooseModule, JobPricingService, JobsService, JobRequestsService, JobChangesService],
})
export class JobsModule {}
