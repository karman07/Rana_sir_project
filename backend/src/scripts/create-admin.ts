import { NestFactory } from '@nestjs/core';
import { Role } from '@rms/shared';
import bcrypt from 'bcryptjs';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';

/** Creates (or resets the password of) the platform admin from ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME. */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  // ConfigModule has loaded .env into process.env by now.
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD');
  const users = app.get(UsersService);
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await users.findByEmail(email);
  if (existing) {
    if (existing.role !== Role.ADMIN) throw new Error(`${email} exists with role ${existing.role}`);
    existing.passwordHash = passwordHash;
    existing.emailVerified = true;
    await existing.save();
    console.log(`Admin password reset for ${email}`);
  } else {
    await users.create({ email, name: process.env.ADMIN_NAME ?? 'Platform Admin', role: Role.ADMIN, passwordHash, emailVerified: true });
    console.log(`Admin created: ${email}`);
  }
  await app.close();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
