import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import type { Env } from '../../config/env';
import { softDeletePlugin } from './base.schema';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        uri: config.get('MONGODB_URI'),
        serverSelectionTimeoutMS: 5000,
        connectionFactory: (connection) => {
          connection.plugin(softDeletePlugin);
          return connection;
        },
      }),
    }),
  ],
})
export class DatabaseModule {}
