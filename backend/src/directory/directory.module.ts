import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Application, ApplicationSchema } from '../applications/schemas/application.schema';
import { CandidateProfile, CandidateProfileSchema } from '../candidates/schemas/candidate-profile.schema';
import { Company, CompanySchema } from '../companies/schemas/company.schema';
import { RecruiterCompany, RecruiterCompanySchema } from '../companies/schemas/recruiter-company.schema';
import { Contract, ContractSchema } from '../contracts/schemas/contract.schema';
import { Job, JobSchema } from '../jobs/schemas/job.schema';
import { JobRequest, JobRequestSchema } from '../jobs/schemas/job-request.schema';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema';
import { Payslip, PayslipSchema } from '../payslips/schemas/payslip.schema';
import { RecruiterProfile, RecruiterProfileSchema } from '../recruiters/schemas/recruiter-profile.schema';
import { Salary, SalarySchema } from '../salary/schemas/salary.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { DirectoryController } from './directory.controller';
import { DirectoryService } from './directory.service';

@Module({
  imports: [MongooseModule.forFeature([
    { name: User.name, schema: UserSchema }, { name: RecruiterProfile.name, schema: RecruiterProfileSchema }, { name: Company.name, schema: CompanySchema }, { name: RecruiterCompany.name, schema: RecruiterCompanySchema },
    { name: CandidateProfile.name, schema: CandidateProfileSchema }, { name: Job.name, schema: JobSchema }, { name: JobRequest.name, schema: JobRequestSchema }, { name: Application.name, schema: ApplicationSchema }, { name: Contract.name, schema: ContractSchema },
    { name: Payment.name, schema: PaymentSchema }, { name: Salary.name, schema: SalarySchema }, { name: Payslip.name, schema: PayslipSchema },
  ])],
  controllers: [DirectoryController],
  providers: [DirectoryService],
})
export class DirectoryModule {}
