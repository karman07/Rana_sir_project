import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { Role } from '@rms/shared';
import type { Connection } from 'mongoose';
import { AppModule } from '../app.module';
import type { AuthUser } from '../auth/decorators';
import { JobRequestsService } from '../jobs/job-requests.service';

/**
 * Adds a batch of realistic part-time and gig openings, created the way real ones are: a recruiter submits each,
 * Admin sets our commission and approves it. Safe to run more than once: titles that already exist are skipped.
 * Amounts are in the company's currency (INR amounts are written in rupees).
 */
const GIGS: { title: string; dept: string; type: string; mode: string; basis: 'HOUR' | 'MONTH'; min: number; max: number; hrs?: number; skills: string[]; exp: number; commission: number; openings: number; about: string }[] = [
  { title: 'Freelance Logo & Brand Designer', dept: 'Design', type: 'CONTRACT', mode: 'REMOTE', basis: 'HOUR', min: 18, max: 30, hrs: 10, skills: ['Illustrator', 'Branding', 'Figma'], exp: 2, commission: 20, openings: 3, about: 'Design logos and brand kits for small businesses. Flexible hours, project by project.' },
  { title: 'Part-time Content Writer', dept: 'Marketing', type: 'PART_TIME', mode: 'REMOTE', basis: 'MONTH', min: 700, max: 1100, skills: ['Copywriting', 'SEO', 'Research'], exp: 1, commission: 25, openings: 4, about: 'Write blog posts and product pages, around 15 hours a week.' },
  { title: 'Weekend Customer Support Agent', dept: 'Support', type: 'PART_TIME', mode: 'REMOTE', basis: 'HOUR', min: 8, max: 12, hrs: 16, skills: ['Customer Service', 'Chat Support', 'English'], exp: 0, commission: 15, openings: 6, about: 'Answer chats and emails on Saturdays and Sundays.' },
  { title: 'Freelance Video Editor', dept: 'Media', type: 'CONTRACT', mode: 'REMOTE', basis: 'HOUR', min: 15, max: 28, hrs: 12, skills: ['Premiere Pro', 'After Effects', 'Storytelling'], exp: 2, commission: 20, openings: 2, about: 'Edit short promotional videos and reels for social media.' },
  { title: 'Part-time Bookkeeper', dept: 'Finance', type: 'PART_TIME', mode: 'HYBRID', basis: 'MONTH', min: 800, max: 1200, skills: ['Tally', 'Bookkeeping', 'GST'], exp: 2, commission: 18, openings: 2, about: 'Keep the books for a growing retail business, three days a week.' },
  { title: 'Online Maths Tutor', dept: 'Education', type: 'PART_TIME', mode: 'REMOTE', basis: 'HOUR', min: 10, max: 18, hrs: 10, skills: ['Mathematics', 'Teaching', 'Patience'], exp: 1, commission: 22, openings: 5, about: 'Evening one-to-one sessions for school students.' },
  { title: 'Social Media Manager (Part-time)', dept: 'Marketing', type: 'PART_TIME', mode: 'REMOTE', basis: 'MONTH', min: 900, max: 1500, skills: ['Instagram', 'Content Calendar', 'Analytics'], exp: 2, commission: 25, openings: 2, about: 'Plan and post across Instagram and LinkedIn for two brands.' },
  { title: 'React Developer (Gig)', dept: 'Engineering', type: 'CONTRACT', mode: 'REMOTE', basis: 'HOUR', min: 30, max: 50, hrs: 20, skills: ['React', 'TypeScript', 'REST APIs'], exp: 3, commission: 15, openings: 2, about: 'Build dashboard screens for a fintech start-up. Three-month engagement.' },
  { title: 'Data Entry Operator', dept: 'Operations', type: 'PART_TIME', mode: 'ONSITE', basis: 'MONTH', min: 400, max: 600, skills: ['Typing', 'Excel', 'Accuracy'], exp: 0, commission: 12, openings: 8, about: 'Enter and verify records at the client office, mornings only.' },
  { title: 'Voice-over Artist (English)', dept: 'Media', type: 'CONTRACT', mode: 'REMOTE', basis: 'HOUR', min: 14, max: 25, hrs: 8, skills: ['Voice Acting', 'Audacity', 'Clear Diction'], exp: 1, commission: 20, openings: 3, about: 'Record narration for explainer videos and e-learning.' },
];

/** Gigs are often paid on a short cycle; the rest are monthly. */
const FREQUENCY: Record<string, 'DAILY' | 'WEEKLY'> = { 'Weekend Customer Support Agent': 'WEEKLY', 'Online Maths Tutor': 'WEEKLY', 'Freelance Video Editor': 'WEEKLY', 'Voice-over Artist (English)': 'WEEKLY', 'Data Entry Operator': 'DAILY' };

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const conn = app.get<Connection>(getConnectionToken());
  const requests = app.get(JobRequestsService);
  const db = conn.db!;
  const admin = await db.collection('users').findOne({ role: Role.ADMIN });
  if (!admin) throw new Error('Create an admin first (npm run create-admin)');
  const adminUser = { id: String(admin._id), role: Role.ADMIN, name: admin.name, email: admin.email } as AuthUser;

  // Recruiters who are approved and linked to at least one approved company.
  const links = await db.collection('recruitercompanies').find({ approvalStatus: 'APPROVED' }).toArray();
  const pairs: { user: AuthUser; companyId: string; currency: string }[] = [];
  for (const l of links) {
    const [u, c] = await Promise.all([db.collection('users').findOne({ _id: l.recruiterUserId, role: Role.RECRUITER }), db.collection('companies').findOne({ _id: l.companyId, approvalStatus: 'APPROVED' })]);
    if (!u || !c) continue;
    pairs.push({ user: { id: String(u._id), role: Role.RECRUITER, name: u.name, email: u.email } as AuthUser, companyId: String(c._id), currency: c.country === 'IN' ? 'INR' : (u.currency ?? 'USD') });
  }
  if (!pairs.length) throw new Error('No approved recruiter with an approved company. Run `npm run seed` first.');

  let made = 0;
  for (const [i, g] of GIGS.entries()) {
    if (await db.collection('jobs').findOne({ 'spec.title': g.title })) { console.log(`skip   ${g.title} (already there)`); continue; }
    const p = pairs[i % pairs.length];
    const fx = p.currency === 'INR' ? 60 : 1;
    const minor = (n: number) => Math.round(n * fx * 100);
    const created = await requests.create({
      companyId: p.companyId,
      spec: {
        title: g.title, department: g.dept, location: 'Remote / flexible', workMode: g.mode, employmentType: g.type, openings: g.openings,
        requirements: { experienceMin: g.exp, experienceMax: g.exp + 4, education: 'Not required', technicalSkills: g.skills, softSkills: ['Reliability', 'Communication'], certifications: [], languages: ['English'] },
        compensation: { salaryMin: minor(g.min), salaryMax: minor(g.max), currency: p.currency, payBasis: g.basis, payFrequency: FREQUENCY[g.title] ?? 'MONTHLY', hoursPerWeek: g.basis === 'HOUR' ? g.hrs : undefined, benefits: ['Flexible hours', 'Paid on time'] },
        contract: { probationMonths: 1, noticePeriodDays: 14, workingHours: g.basis === 'HOUR' ? `${g.hrs} hours/week` : '15-20 hours/week', durationMonths: g.type === 'CONTRACT' ? 3 : undefined },
        details: { description: g.about, responsibilities: 'Deliver the work on time, keep the client updated and flag problems early.', requirementsText: `Comfortable with ${g.skills.join(', ')}.`, specialInstructions: 'Dummy opening for testing.' },
      } as never,
    }, p.user);
    await requests.submit(created.id, p.user);
    await requests.approve(created.id, adminUser, 'Looks good', true, { type: 'PERCENT', percent: g.commission });
    console.log(`added  ${g.title}  (${g.commission}% commission)`);
    made++;
  }
  console.log(`Done: ${made} new live openings.`);
  await app.close();
}
main().catch((e) => { console.error(e?.response?.message ?? e.message); process.exit(1); });
