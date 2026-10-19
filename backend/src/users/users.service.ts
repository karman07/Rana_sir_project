import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { User, type UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly model: Model<User>) {}

  findById(id: string) {
    return this.model.findById(id).exec() as Promise<UserDocument | null>;
  }

  findByEmail(email: string, withPassword = false) {
    const q = this.model.findOne({ email: email.toLowerCase().trim() });
    if (withPassword) q.select('+passwordHash');
    return q.exec() as Promise<UserDocument | null>;
  }

  findByGoogleId(googleId: string) {
    return this.model.findOne({ googleId }).exec() as Promise<UserDocument | null>;
  }

  markEmailVerified(id: string) {
    return this.model.updateOne({ _id: id }, { emailVerified: true }).exec();
  }

  create(data: Partial<User>) {
    return this.model.create(data) as Promise<UserDocument>;
  }
}
