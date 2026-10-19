import { Global, Injectable, Module } from '@nestjs/common';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

@Schema({ collection: 'counters' })
export class Counter {
  @Prop({ required: true, unique: true }) key: string;
  @Prop({ default: 0 }) seq: number;
}
const CounterSchema = SchemaFactory.createForClass(Counter);

/** Atomic human-readable sequence numbers (JR-0001, JOB-1001, ...). */
@Injectable()
export class CounterService {
  constructor(@InjectModel(Counter.name) private readonly model: Model<Counter>) {}

  async next(key: string, start = 1): Promise<number> {
    const doc = await this.model
      .findOneAndUpdate({ key }, { $inc: { seq: 1 }, $setOnInsert: { key } }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true })
      .lean();
    // First call returns 1; shift so sequences can begin at `start`.
    return doc!.seq + start - 1;
  }
}

@Global()
@Module({ imports: [MongooseModule.forFeature([{ name: Counter.name, schema: CounterSchema }])], providers: [CounterService], exports: [CounterService] })
export class CounterModule {}
