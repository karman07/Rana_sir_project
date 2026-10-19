import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CandidatePoolController } from './candidate-pool.controller';
import { CandidatePoolService } from './candidate-pool.service';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { JobsModule } from '../jobs/jobs.module';
import { CandidateProfile, CandidateProfileSchema } from './schemas/candidate-profile.schema';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: CandidateProfile.name, schema: CandidateProfileSchema }]), JobsModule],
  controllers: [CandidatesController, CandidatePoolController],
  providers: [CandidatesService, CandidatePoolService],
  exports: [MongooseModule, CandidatesService],
})
export class CandidatesModule {}
