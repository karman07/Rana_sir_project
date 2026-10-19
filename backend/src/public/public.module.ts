import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobsModule } from '../jobs/jobs.module';
import { Message, MessageSchema } from './message.schema';
import { PublicController } from './public.controller';

@Module({
  imports: [JobsModule, MongooseModule.forFeature([{ name: Message.name, schema: MessageSchema }])],
  controllers: [PublicController],
})
export class PublicModule {}
