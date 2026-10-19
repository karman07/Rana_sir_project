import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { RecruitersController } from './recruiters.controller';
import { RecruitersService } from './recruiters.service';
import { RecruiterProfile, RecruiterProfileSchema } from './schemas/recruiter-profile.schema';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: RecruiterProfile.name, schema: RecruiterProfileSchema }]), AuthModule],
  controllers: [RecruitersController],
  providers: [RecruitersService],
  exports: [MongooseModule, RecruitersService],
})
export class RecruitersModule {}
