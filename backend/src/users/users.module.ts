import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthToken, AuthTokenSchema } from './schemas/auth-token.schema';
import { RefreshSession, RefreshSessionSchema } from './schemas/refresh-session.schema';
import { User, UserSchema } from './schemas/user.schema';
import { UsersService } from './users.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: RefreshSession.name, schema: RefreshSessionSchema },
      { name: AuthToken.name, schema: AuthTokenSchema },
    ]),
  ],
  providers: [UsersService],
  exports: [UsersService, MongooseModule],
})
export class UsersModule {}
