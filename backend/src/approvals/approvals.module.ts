import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { ContractsModule } from '../contracts/contracts.module';
import { ApplicationsModule } from '../applications/applications.module';
import { PaymentsModule } from '../payments/payments.module';
import { SalaryModule } from '../salary/salary.module';
import { ScreeningModule } from '../screening/screening.module';
import { ApprovalSourceRegistrar, CandidateRequestSource, ContractApprovalSource, ContractChangeSource, PaymentConfirmationSource, SalaryDelaySource, CompanyLinkSource, CompanySource, JobRequestSource, JobChangeSource, RecruiterAccountSource, RecruiterDecisionSource } from './approval-sources';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';

@Module({
  imports: [JobsModule, ApplicationsModule, ScreeningModule, ContractsModule, PaymentsModule, SalaryModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService, RecruiterAccountSource, CompanySource, CompanyLinkSource, JobRequestSource, JobChangeSource, RecruiterDecisionSource, CandidateRequestSource, ContractApprovalSource, ContractChangeSource, PaymentConfirmationSource, SalaryDelaySource, ApprovalSourceRegistrar],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
