import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditController } from './audit.controller';
import { AuditListener } from './audit.listener';
import { AuditService } from './audit.service';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: AuditLog.name, schema: AuditLogSchema }])],
  controllers: [AuditController],
  providers: [AuditService, AuditListener],
  exports: [AuditService, MongooseModule],
})
export class AuditModule {}
