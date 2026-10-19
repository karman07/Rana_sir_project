import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { diskStorage } from 'multer';
import { Application, ApplicationSchema } from '../applications/schemas/application.schema';
import type { Env } from '../config/env';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { MAX_UPLOAD_BYTES } from './file-validation';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { DocumentFile, DocumentFileSchema } from './schemas/document.schema';

const multer = MulterModule.registerAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => {
    const root = resolve(config.get('UPLOAD_DIR'));
    return {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
      // Files land outside any web root under random names; the client's file name is stored as metadata only.
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const d = new Date();
          const dir = join(root, String(d.getUTCFullYear()), String(d.getUTCMonth() + 1).padStart(2, '0'));
          mkdir(dir, { recursive: true }).then(() => cb(null, dir), (e) => cb(e, ''));
        },
        filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase().slice(0, 8)}`),
      }),
    };
  },
});

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: DocumentFile.name, schema: DocumentFileSchema }, { name: Application.name, schema: ApplicationSchema }, { name: Payment.name, schema: PaymentSchema }, { name: User.name, schema: UserSchema }]),
    multer,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService, MongooseModule, multer],
})
export class DocumentsModule {}
