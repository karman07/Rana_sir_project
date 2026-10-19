import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

const lower = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));

export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;
const PASSWORD_MSG = 'Password must be 8–72 characters and include a letter and a number';

export class LoginDto {
  @lower() @IsEmail() email: string;
  @IsString() @MaxLength(72) password: string;
}

class BaseRegisterDto {
  @IsString() @Length(2, 80) name: string;
  @lower() @IsEmail() email: string;
  @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) password: string;
  @IsOptional() @IsString() @Length(2, 2) country?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
}

export class RegisterCandidateDto extends BaseRegisterDto {}

export class RegisterRecruiterDto extends BaseRegisterDto {
  @IsOptional() @IsString() @MaxLength(120) agencyName?: string;
}

export class GoogleLoginDto {
  @IsString() @MaxLength(4096) credential: string;
  /** Only used when the Google account is new. ADMIN can never be created this way. */
  @IsOptional() @IsIn(['CANDIDATE', 'RECRUITER']) intent?: 'CANDIDATE' | 'RECRUITER';
}

export class EmailOnlyDto {
  @lower() @IsEmail() email: string;
}

export class TokenDto {
  @IsString() @Length(20, 200) token: string;
}

export class ResetPasswordDto extends TokenDto {
  @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) password: string;
}
