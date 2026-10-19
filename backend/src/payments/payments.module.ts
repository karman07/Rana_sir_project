import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommissionsModule } from '../commissions/commissions.module';
import { ContractsModule } from '../contracts/contracts.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { LedgerEntry, LedgerEntrySchema } from './schemas/ledger-entry.schema';
import { Salary, SalarySchema } from '../salary/schemas/salary.schema';
import { Payment, PaymentSchema } from './schemas/payment.schema';

@Module({
  imports: [CommissionsModule, ContractsModule, MongooseModule.forFeature([{ name: Payment.name, schema: PaymentSchema }, { name: LedgerEntry.name, schema: LedgerEntrySchema }, { name: Salary.name, schema: SalarySchema }])],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService, MongooseModule],
})
export class PaymentsModule {}
