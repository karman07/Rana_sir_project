import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { ApplicationStatus as S, Role } from '@rms/shared';
import { DocumentType } from '../documents/schemas/document.schema';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Types, type Connection } from 'mongoose';
import { AppModule } from '../app.module';
import type { AuthUser } from '../auth/decorators';
import { ApplicationsService } from '../applications/applications.service';
import { RecruitmentWorkflowService } from '../applications/recruitment-workflow.service';
import { periodOf, shiftPeriod } from '../common/pay-period';
import { ContractsService } from '../contracts/contracts.service';
import { DocumentsService } from '../documents/documents.service';
import { InterviewsService } from '../interviews/interviews.service';
import { JobRequestsService } from '../jobs/job-requests.service';
import { PaymentsService } from '../payments/payments.service';
import { RecruiterReviewService } from '../screening/recruiter-review.service';
import { ScreeningService } from '../screening/screening.service';

/**
 * Walks one candidate through the whole journey on three different jobs (paid monthly, weekly and daily), the way real people would:
 * apply, our interview, shortlist, the recruiter's approval and interview, selection, contract, then the candidate asks for their pay
 * and the recruiter releases it. It stops there so the last steps (Admin confirms the money and releases it to the candidate) can be done by hand.
 *
 *   npm run demo-flow -- you@example.com
 *
 * Local data only: it acts as the existing seeded admin and recruiter, and as the candidate you name.
 */
const DAY = 86_400_000;
const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');

const SCENARIOS = [
  { key: 'Monthly', frequency: 'MONTHLY', title: 'Content Writer (monthly pay)', basis: 'MONTH', min: 30_000, max: 35_000, hours: undefined, commission: 20, startDaysAgo: 70 },
  { key: 'Weekly', frequency: 'WEEKLY', title: 'Online Tutor (weekly pay)', basis: 'HOUR', min: 400, max: 500, hours: 15, commission: 15, startDaysAgo: 28 },
  { key: 'Daily', frequency: 'DAILY', title: 'Event Promoter (daily pay)', basis: 'HOUR', min: 500, max: 600, hours: 20, commission: 25, startDaysAgo: 8 },
] as const;

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error('Usage: npm run demo-flow -- <candidate email>');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const db = app.get<Connection>(getConnectionToken()).db!;
  const asUser = async (filter: Record<string, unknown>): Promise<AuthUser> => {
    const u = await db.collection('users').findOne(filter);
    if (!u) throw new Error(`No user matches ${JSON.stringify(filter)}`);
    return { id: String(u._id), role: u.role, name: u.name, email: u.email } as AuthUser;
  };
  const admin = await asUser({ role: Role.ADMIN, email: process.env.ADMIN_EMAIL ?? 'admin@talentbridge.test' });
  const recruiter = await asUser({ email: 'priya.nair@seed.talentbridge.test' });
  const candidate = await asUser({ email: email.toLowerCase(), role: Role.CANDIDATE });

  const jobs = app.get(JobRequestsService), apps = app.get(ApplicationsService), workflow = app.get(RecruitmentWorkflowService);
  const interviews = app.get(InterviewsService), screening = app.get(ScreeningService), review = app.get(RecruiterReviewService);
  const contracts = app.get(ContractsService), payments = app.get(PaymentsService), documents = app.get(DocumentsService);

  // A resume to apply with, if the candidate has none yet.
  if (!(await documents.activeResume(candidate.id))) {
    const dir = join(documents.root, candidate.id); mkdirSync(dir, { recursive: true });
    const path = join(dir, 'resume-demo.pdf'); writeFileSync(path, PDF);
    await documents.register({ path, filename: 'resume-demo.pdf', originalname: 'Resume.pdf', size: PDF.length }, candidate, { type: DocumentType.RESUME, label: 'Resume', group: 'resume' });
    console.log('Added a placeholder resume to the candidate');
  }

  const link = await db.collection('recruitercompanies').findOne({ recruiterUserId: new Types.ObjectId(recruiter.id), approvalStatus: 'APPROVED' });
  if (!link) throw new Error('The recruiter has no approved company');
  const company = await db.collection('companies').findOne({ _id: link.companyId });
  const currency = company?.country === 'IN' ? 'INR' : 'USD';
  const fx = currency === 'INR' ? 1 : 1 / 60;
  const minor = (n: number) => Math.round(n * fx * 100);

  /** An interview that has already happened: booked for the future, then moved into the past and completed. */
  const heldInterview = async (applicationId: string, by: AuthUser) => {
    const i = await interviews.schedule({ applicationId, type: 'PHONE', startsAt: new Date(Date.now() + 3_600_000).toISOString(), durationMinutes: 30 } as never, by) as { id: string };
    await db.collection('interviews').updateOne({ _id: new Types.ObjectId(i.id) }, { $set: { startsAt: new Date(Date.now() - 3_600_000) } });
    await interviews.complete(i.id, by);
  };

  const requested: string[] = [];
  const requestedContracts: { key: string; contractId: string; paymentId: string }[] = [];
  for (const s of SCENARIOS) {
    console.log(`\n=== ${s.title} ===`);
    let job = await db.collection('jobs').findOne({ 'spec.title': s.title });
    if (!job) {
      const jr = await jobs.create({
        companyId: String(link.companyId),
        spec: {
          title: s.title, department: 'Operations', location: 'Remote', workMode: 'REMOTE', employmentType: 'PART_TIME', openings: 3,
          requirements: { experienceMin: 0, technicalSkills: ['Communication'], softSkills: ['Reliability'], languages: ['English'] },
          compensation: { salaryMin: minor(s.min), salaryMax: minor(s.max), currency, payBasis: s.basis, payFrequency: s.frequency, hoursPerWeek: s.hours, benefits: ['Flexible hours'] },
          contract: { probationMonths: 1, noticePeriodDays: 14 },
          details: { description: `A part-time role paid ${s.frequency.toLowerCase()}. Created to try out the full journey.`, responsibilities: 'Do the work well and on time.' },
        } as never,
      }, recruiter) as { id: string };
      await jobs.submit(jr.id, recruiter);
      await jobs.approve(jr.id, admin, 'Approved', true, { type: 'PERCENT', percent: s.commission });
      job = await db.collection('jobs').findOne({ 'spec.title': s.title });
      console.log(`  job published (commission ${s.commission}%)`);
    }
    const jobId = String(job!._id);

    // 1. the candidate applies
    let a = await db.collection('applications').findOne({ candidateId: new Types.ObjectId(candidate.id), jobId: job!._id });
    if (!a) { await apps.apply({ jobId } as never, candidate); a = await db.collection('applications').findOne({ candidateId: new Types.ObjectId(candidate.id), jobId: job!._id }); console.log(`  ${a!.applicationNumber}: applied`); }
    const appId = String(a!._id);

    // 2. Admin reviews, interviews and shortlists; 3. sends to the recruiter
    if (a!.status === S.APPLIED) { await workflow.transition(appId, S.ADMIN_REVIEW, admin); await heldInterview(appId, admin); await screening.shortlist(appId, admin, 'Strong profile'); await screening.sendToRecruiter([appId], admin); console.log('  admin interviewed, shortlisted and sent to the recruiter'); }
    let cur = (await db.collection('applications').findOne({ _id: a!._id }))!.status;
    // 4. the recruiter approves, interviews and selects
    if (cur === S.SENT_TO_RECRUITER || cur === S.RECRUITER_REVIEW) { await review.approve(appId, { score: 85, notes: 'Good fit' }, recruiter); await heldInterview(appId, recruiter); console.log('  recruiter approved and interviewed'); }
    cur = (await db.collection('applications').findOne({ _id: a!._id }))!.status;
    if (cur === S.INTERVIEW || cur === S.RECRUITER_APPROVED) { if (cur === S.RECRUITER_APPROVED) await workflow.transition(appId, S.INTERVIEW, recruiter); await workflow.transition(appId, S.SELECTED, recruiter); console.log('  recruiter selected the candidate'); }
    cur = (await db.collection('applications').findOne({ _id: a!._id }))!.status;

    // 5. contract
    let contract = await db.collection('contracts').findOne({ applicationId: a!._id });
    if (!contract && cur === S.SELECTED) {
      const c = await contracts.create({
        applicationId: appId, title: s.title, employmentType: 'PART_TIME', salaryAmount: minor(s.basis === 'HOUR' ? s.min : s.min), currency, salaryPeriod: s.basis, hoursPerWeek: s.hours,
        startDate: day(-s.startDaysAgo), probationMonths: 1, noticePeriodDays: 14,
      } as never, recruiter) as { id: string };
      await contracts.submit(c.id, recruiter);
      await contracts.approve(c.id, admin);
      await contracts.approve(c.id, candidate);
      contract = await db.collection('contracts').findOne({ _id: new Types.ObjectId(c.id) });
      console.log(`  contract ${contract!.contractNumber} active since ${contract!.startDate}`);
    }
    if (!contract) continue;
    requestedContracts.push({ key: s.key, contractId: String(contract._id), paymentId: '' });
  }

  // Billing creates each period that has finished; then the candidate asks for the most recent finished one of each.
  const billed = await payments.runBilling();
  console.log(`\nBilling: ${billed.created} payment(s) created`);
  for (const rc of requestedContracts) {
    const s = SCENARIOS.find((x) => x.key === rc.key)!;
    const kind = s.frequency === 'MONTHLY' ? 'MONTH' : s.frequency === 'WEEKLY' ? 'WEEK' : 'DAY';
    const period = shiftPeriod(periodOf(day(0), kind), -1);
    try {
      const r = await payments.requestPay({ contractId: rc.contractId, period, note: `Please release my ${s.key.toLowerCase()} pay` }, candidate) as { id: string } | undefined;
      if (r) { rc.paymentId = r.id; requested.push(r.id); console.log(`  ${s.key}: asked for ${period}`); }
    } catch (e: any) { console.log(`  ${s.key}: ${e?.response?.message ?? e.message}`); const p = await db.collection('payments').findOne({ contractId: new Types.ObjectId(rc.contractId), period }); if (p) rc.paymentId = String(p._id); }
  }

  // The recruiter releases all three in one transfer; Admin is notified.
  const toRelease = requestedContracts.map((r) => r.paymentId).filter(Boolean);
  const open = (await db.collection('payments').find({ _id: { $in: toRelease.map((i) => new Types.ObjectId(i)) }, status: 'AWAITING_CLIENT' }).toArray()).map((p) => String(p._id));
  if (open.length) {
    const r = await payments.releaseBatch({ paymentIds: open, method: 'UPI', reference: `DEMO-UTR-${Date.now().toString().slice(-6)}`, note: 'Released for the three requests' } as never, recruiter);
    console.log(`\nRecruiter released ${r.count} payment(s) in one transfer (${r.batchRef}). Admin has been notified.`);
  }
  console.log('\nLeft for you as Admin: confirm the money arrived, then release each payout to the candidate.');
  await app.close();
}
main().catch((e) => { console.error(e?.response?.message ?? e.message, e?.stack?.split('\n')[1] ?? ''); process.exit(1); });
