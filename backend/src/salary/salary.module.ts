import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContractsModule } from '../contracts/contracts.module';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema';
import { Payslip, PayslipSchema } from '../payslips/schemas/payslip.schema';
import { SalaryController } from './salary.controller';
import { SalaryListener } from './salary.listener';
import { SalaryService } from './salary.service';
import { Salary, SalarySchema } from './schemas/salary.schema';

@Module({
  imports: [ContractsModule, MongooseModule.forFeature([{ name: Salary.name, schema: SalarySchema }, { name: Payment.name, schema: PaymentSchema }, { name: Payslip.name, schema: PayslipSchema }])],
  controllers: [SalaryController],
  providers: [SalaryService, SalaryListener],
  exports: [SalaryService, MongooseModule],
})
export class SalaryModule {}
