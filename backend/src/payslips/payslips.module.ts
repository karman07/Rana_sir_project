import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContractsModule } from '../contracts/contracts.module';
import { Job, JobSchema } from '../jobs/schemas/job.schema';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema';
import { Salary, SalarySchema } from '../salary/schemas/salary.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { PayslipsController } from './payslips.controller';
import { PayslipsListener } from './payslips.listener';
import { PayslipsService } from './payslips.service';
import { Payslip, PayslipSchema } from './schemas/payslip.schema';

@Module({
  imports: [ContractsModule, MongooseModule.forFeature([
    { name: Payslip.name, schema: PayslipSchema }, { name: Payment.name, schema: PaymentSchema }, { name: Salary.name, schema: SalarySchema },
    { name: Job.name, schema: JobSchema }, { name: User.name, schema: UserSchema },
  ])],
  controllers: [PayslipsController],
  providers: [PayslipsService, PayslipsListener],
  exports: [PayslipsService, MongooseModule],
})
export class PayslipsModule {}
