import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isValidObjectId } from 'mongoose';

@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string) {
    if (!isValidObjectId(value) || String(value).length !== 24) throw new BadRequestException('Invalid id');
    return value;
  }
}
