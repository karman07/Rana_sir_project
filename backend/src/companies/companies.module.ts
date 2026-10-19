import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SiteContentModule } from '../site-content/site-content.module';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { Company, CompanySchema } from './schemas/company.schema';
import { RecruiterCompany, RecruiterCompanySchema } from './schemas/recruiter-company.schema';

/** Client companies: recruiters submit, Admin approves. */
@Global()
@Module({
  imports: [
    SiteContentModule,
    MongooseModule.forFeature([
      { name: Company.name, schema: CompanySchema },
      { name: RecruiterCompany.name, schema: RecruiterCompanySchema },
    ]),
  ],
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [MongooseModule, CompaniesService],
})
export class CompaniesModule {}
