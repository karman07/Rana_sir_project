import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApplicationsModule } from '../applications/applications.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { JobsModule } from '../jobs/jobs.module';
import { CommissionCalculationService } from './commission-calculation.service';
import { ContractDocumentsService } from './contract-documents.service';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { ContractVersion, ContractVersionSchema } from './schemas/contract-version.schema';
import { Contract, ContractSchema } from './schemas/contract.schema';

@Module({
  imports: [CommissionsModule, JobsModule, ApplicationsModule, MongooseModule.forFeature([{ name: Contract.name, schema: ContractSchema }, { name: ContractVersion.name, schema: ContractVersionSchema }])],
  controllers: [ContractsController],
  providers: [ContractsService, CommissionCalculationService, ContractDocumentsService],
  exports: [MongooseModule, ContractsService, CommissionCalculationService],
})
export class ContractsModule {}
