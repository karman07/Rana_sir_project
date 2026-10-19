import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Application, ApplicationSchema } from '../applications/schemas/application.schema';
import { CandidateProfile, CandidateProfileSchema } from '../candidates/schemas/candidate-profile.schema';
import { Company, CompanySchema } from '../companies/schemas/company.schema';
import { ContractsModule } from '../contracts/contracts.module';
import { Job, JobSchema } from '../jobs/schemas/job.schema';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema';
import { Payslip, PayslipSchema } from '../payslips/schemas/payslip.schema';
import { Salary, SalarySchema } from '../salary/schemas/salary.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';

@Module({
  imports: [ContractsModule, MongooseModule.forFeature([
    { name: User.name, schema: UserSchema }, { name: CandidateProfile.name, schema: CandidateProfileSchema }, { name: Application.name, schema: ApplicationSchema }, { name: Job.name, schema: JobSchema }, { name: Company.name, schema: CompanySchema },
    { name: Payment.name, schema: PaymentSchema }, { name: Salary.name, schema: SalarySchema }, { name: Payslip.name, schema: PayslipSchema },
  ])],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
