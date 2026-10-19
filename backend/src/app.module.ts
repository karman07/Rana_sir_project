import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env';
import { DatabaseModule } from './common/database/database.module';
import { CounterModule } from './common/database/counter.service';
import { EventsModule } from './common/events/events.module';
import { CommunicationModule } from './communication/communication.module';
import { UsersModule } from './users/users.module';
import { CandidatesModule } from './candidates/candidates.module';
import { CompaniesModule } from './companies/companies.module';
import { RecruitersModule } from './recruiters/recruiters.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { ApplicationsModule } from './applications/applications.module';
import { DocumentsModule } from './documents/documents.module';
import { SiteContentModule } from './site-content/site-content.module';
import { PublicModule } from './public/public.module';
import { ScreeningModule } from './screening/screening.module';
import { InterviewsModule } from './interviews/interviews.module';
import { CommissionsModule } from './commissions/commissions.module';
import { ContractsModule } from './contracts/contracts.module';
import { PaymentsModule } from './payments/payments.module';
import { SalaryModule } from './salary/salary.module';
import { PayslipsModule } from './payslips/payslips.module';
import { ExportsModule } from './exports/exports.module';
import { SettingsModule } from './settings/settings.module';
import { DirectoryModule } from './directory/directory.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { JobsModule } from './jobs/jobs.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    // Tests must never read the developer's .env (it points at the dev database).
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, ignoreEnvFile: process.env.NODE_ENV === 'test' }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    DatabaseModule,
    EventsModule,
    CounterModule,
    CommunicationModule,
    UsersModule,
    CandidatesModule,
    CompaniesModule,
    RecruitersModule,
    DocumentsModule,
    JobsModule,
    ApplicationsModule,
    ScreeningModule,
    InterviewsModule,
    CommissionsModule,
    ContractsModule,
    PaymentsModule,
    SalaryModule,
    PayslipsModule,
    ExportsModule,
    SettingsModule,
    DirectoryModule,
    ApprovalsModule,
    PublicModule,
    SiteContentModule,
    AuditModule,
    AnalyticsModule,
    AuthModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
