import { Module } from '@nestjs/common';
import { ContractsModule } from '../contracts/contracts.module';
import { InterviewsModule } from '../interviews/interviews.module';
import { ScreeningModule } from '../screening/screening.module';
import { JobsModule } from '../jobs/jobs.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema';
import { Payslip, PayslipSchema } from '../payslips/schemas/payslip.schema';
import { Salary, SalarySchema } from '../salary/schemas/salary.schema';
import { AnalyticsController } from './analytics.controller';
import { ReportsService } from './reports.service';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [JobsModule, ScreeningModule, InterviewsModule, ContractsModule, MongooseModule.forFeature([{ name: Payment.name, schema: PaymentSchema }, { name: Payslip.name, schema: PayslipSchema }, { name: Salary.name, schema: SalarySchema }])],
  controllers: [AnalyticsController], providers: [AnalyticsService, ReportsService],
})
export class AnalyticsModule {}
