import { NestFactory } from '@nestjs/core';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { ReviewStatus, Role, currencyForCountry } from '@rms/shared';
import bcrypt from 'bcryptjs';
import type { Connection, Model, Types } from 'mongoose';
import { AppModule } from '../app.module';
import { AuditService } from '../audit/audit.service';
import { CandidateProfile } from '../candidates/schemas/candidate-profile.schema';
import { Company } from '../companies/schemas/company.schema';
import { RecruiterCompany } from '../companies/schemas/recruiter-company.schema';
import { copyFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Application } from '../applications/schemas/application.schema';
import { DocumentFile } from '../documents/schemas/document.schema';
import { Notification } from '../communication/schemas/notification.schema';
import { Email } from '../communication/schemas/email.schema';
import { CandidateRequest } from '../screening/schemas/candidate-request.schema';
import { SiteContentDoc } from '../site-content/site-content.service';
import { DEFAULT_SITE_CONTENT } from '../site-content/site-content.defaults';
import { Interview } from '../interviews/schemas/interview.schema';
import type { AuthUser } from '../auth/decorators';
import { ContractsService } from '../contracts/contracts.service';
import { PaymentsService } from '../payments/payments.service';
import { SalaryService } from '../salary/salary.service';
import { Salary } from '../salary/schemas/salary.schema';
import { Contract } from '../contracts/schemas/contract.schema';
import { Payment } from '../payments/schemas/payment.schema';
import { LedgerEntry } from '../payments/schemas/ledger-entry.schema';
import { ContractVersion } from '../contracts/schemas/contract-version.schema';
import { InterviewFeedback } from '../interviews/schemas/interview-feedback.schema';
import { CounterService } from '../common/database/counter.service';
import { Job } from '../jobs/schemas/job.schema';
import { JobRequest } from '../jobs/schemas/job-request.schema';
import { CommissionRuleDoc } from '../commissions/schemas/commission-rule.schema';
import { JobChangeRequest } from '../jobs/schemas/job-change-request.schema';
import { RecruiterProfile } from '../recruiters/schemas/recruiter-profile.schema';
import { User } from '../users/schemas/user.schema';

/**
 * Development seed. Idempotent: skips when seed data exists; `--reset` wipes seeded collections first.
 * Extended in later parts (jobs, applications, interviews, contracts, payments, ...).
 * Every seeded account uses SEED_PASSWORD.
 */
export const SEED_PASSWORD = 'Password123!';
const DOMAIN = 'seed.talentbridge.test';
const DAY = 86_400_000;

const recruiterUsers_names = () => RECRUITERS.map((r) => r.name);

// Tiny deterministic PRNG so every run produces the same data.
let state = 42;
const rnd = () => ((state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const ago = (days: number) => new Date(Date.now() - days * DAY);
const emailOf = (name: string) => `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@${DOMAIN}`;

const RECRUITERS = [
  { name: 'Priya Nair', agency: 'Nair Talent Partners', country: 'IN', status: ReviewStatus.APPROVED },
  { name: 'Marcus Webb', agency: 'Webb & Hart Search', country: 'GB', status: ReviewStatus.APPROVED },
  { name: 'Sofia Alvarez', agency: 'Meridian Staffing', country: 'US', status: ReviewStatus.APPROVED },
  { name: 'Omar Haddad', agency: 'Gulf Bridge Recruitment', country: 'AE', status: ReviewStatus.PENDING_REVIEW },
  { name: 'Chen Li', agency: 'Lion City Talent', country: 'SG', status: ReviewStatus.CHANGES_REQUESTED, note: 'Please add your agency registration number to your profile.' },
];

const COMPANIES = [
  { name: 'Northwind Labs', industry: 'Software', location: 'Bengaluru', country: 'IN', status: ReviewStatus.APPROVED },
  { name: 'Helix Retail Group', industry: 'Retail', location: 'London', country: 'GB', status: ReviewStatus.APPROVED },
  { name: 'Orchard Health', industry: 'Healthcare', location: 'Austin', country: 'US', status: ReviewStatus.APPROVED },
  { name: 'Sandstone Logistics', industry: 'Logistics', location: 'Dubai', country: 'AE', status: ReviewStatus.APPROVED },
  { name: 'Kestrel Fintech', industry: 'Financial Services', location: 'Singapore', country: 'SG', status: ReviewStatus.PENDING_REVIEW },
];

const FIRST = ['Ananya', 'Rohan', 'Meera', 'Karan', 'Isha', 'Dev', 'Neha', 'Arjun', 'Sanya', 'Vikram', 'Tara', 'Aditya', 'Kavya', 'Rahul', 'Zoya', 'Nikhil', 'Pooja', 'Imran', 'Lakshmi', 'Siddharth'];
const LAST = ['Rao', 'Verma', 'Iyer', 'Shah', 'Kapoor', 'Patel', 'Menon', 'Singh', 'Gupta', 'Khan', 'Reddy', 'Bose', 'Joshi', 'Nair', 'Desai', 'Sethi', 'Mehta', 'Pillai', 'Das', 'Malhotra'];
const TRACKS = [
  { headline: 'Full-stack Engineer', skills: ['TypeScript', 'React', 'Node.js', 'MongoDB', 'AWS'] },
  { headline: 'Data Analyst', skills: ['SQL', 'Python', 'Power BI', 'Excel', 'Statistics'] },
  { headline: 'Product Designer', skills: ['Figma', 'User Research', 'Prototyping', 'Design Systems'] },
  { headline: 'Operations Manager', skills: ['Logistics', 'Vendor Management', 'Six Sigma', 'ERP'] },
  { headline: 'Marketing Specialist', skills: ['SEO', 'Content Strategy', 'Google Analytics', 'Paid Media'] },
  { headline: 'Accountant', skills: ['Tally', 'GST', 'Financial Reporting', 'Excel'] },
];
const CITIES: Record<string, string[]> = { IN: ['Bengaluru', 'Mumbai', 'Pune', 'Delhi', 'Hyderabad'], GB: ['London', 'Manchester'], US: ['Austin', 'New York'], AE: ['Dubai'], SG: ['Singapore'] };
// Rough annual expected salary in major currency units, per country.
const SALARY: Record<string, [number, number]> = { IN: [600000, 2400000], GB: [32000, 70000], US: [55000, 130000], AE: [120000, 300000], SG: [48000, 110000] };

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed in production');

  const users = app.get<Model<User>>(getModelToken(User.name));
  const recruiters = app.get<Model<RecruiterProfile>>(getModelToken(RecruiterProfile.name));
  const candidates = app.get<Model<CandidateProfile>>(getModelToken(CandidateProfile.name));
  const companies = app.get<Model<Company>>(getModelToken(Company.name));
  const links = app.get<Model<RecruiterCompany>>(getModelToken(RecruiterCompany.name));
  const audit = app.get(AuditService);
  const jobRequests = app.get<Model<any>>(getModelToken(JobRequest.name));
  const jobs = app.get<Model<any>>(getModelToken(Job.name));
  const counters = app.get(CounterService);
  const applications = app.get<Model<any>>(getModelToken(Application.name));
  const candidateRequestsM = app.get<Model<any>>(getModelToken(CandidateRequest.name));
  const interviewsM = app.get<Model<any>>(getModelToken(Interview.name));
  const jobChanges = app.get<Model<any>>(getModelToken(JobChangeRequest.name));
  const feedbackM = app.get<Model<any>>(getModelToken(InterviewFeedback.name));
  const notificationsM = app.get<Model<any>>(getModelToken(Notification.name));
  const emailsM = app.get<Model<any>>(getModelToken(Email.name));
  const documents = app.get<Model<any>>(getModelToken(DocumentFile.name));

  const seeded = await users.find({ email: new RegExp(`@${DOMAIN}$`) }).select('_id').lean();
  if (seeded.length && !process.argv.includes('--reset')) {
    console.log('Seed data already present. Use `npm run seed -- --reset` to recreate it.');
    return app.close();
  }
  if (seeded.length) {
    const ids = seeded.map((u) => u._id);
    await Promise.all([
      recruiters.deleteMany({ userId: { $in: ids } }), candidates.deleteMany({ userId: { $in: ids } }),
      links.deleteMany({ recruiterUserId: { $in: ids } }), users.deleteMany({ _id: { $in: ids } }),
      companies.deleteMany({ name: { $in: COMPANIES.map((c) => c.name) } }),
      jobRequests.deleteMany({ requestNumber: /^JR-/ }), jobs.deleteMany({ jobNumber: /^JOB-/ }),
      notificationsM.deleteMany({ userId: { $in: ids } }), emailsM.deleteMany({ to: new RegExp(`@${DOMAIN}$`) }),
      interviewsM.deleteMany({ interviewNumber: /^INT-/ }), jobChanges.deleteMany({ changeNumber: /^JCR-/ }), feedbackM.deleteMany({ authorName: { $in: recruiterUsers_names() } }),
      applications.deleteMany({ applicationNumber: /^APP-/ }), candidateRequestsM.deleteMany({ reason: /^\[seed\]/ }), documents.deleteMany({ originalName: /^Resume - / }),
    ]);
    await app.get<Model<any>>(getModelToken(Contract.name)).deleteMany({});
    await app.get<Model<any>>(getModelToken(ContractVersion.name)).deleteMany({});
    await app.get<Model<any>>(getModelToken(Payment.name)).deleteMany({});
    await app.get<Model<any>>(getModelToken(Salary.name)).deleteMany({});
    // Payslips refuse deletion through the app by design; a dev reset goes straight to the collection.
    await app.get<Connection>(getConnectionToken()).collection('payslips').deleteMany({});
    await app.get<Model<any>>(getModelToken(LedgerEntry.name)).deleteMany({});
    await app.get<Model<any>>(getModelToken('CommissionRuleDoc')).deleteMany({});
    await app.get(CounterService)['model'].deleteMany({});
    // Audit entries are immutable by design; reset leaves older history in place, which is fine for dev.
  }

  const admin = await users.findOne({ role: Role.ADMIN }).lean();
  if (!admin) throw new Error('No admin exists. Run `npm run create-admin` first.');
  const adminRef = { id: String(admin._id), role: 'ADMIN', name: admin.name };
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  // Recruiters
  const recruiterUsers: { id: string; name: string; status: ReviewStatus }[] = [];
  for (const [i, r] of RECRUITERS.entries()) {
    const joined = ago(40 - i * 6);
    const u = await users.create({
      email: emailOf(r.name), name: r.name, role: Role.RECRUITER, passwordHash, emailVerified: true,
      country: r.country, currency: currencyForCountry(r.country), lastLoginAt: ago(int(0, 5)), createdAt: joined,
    });
    const decided = r.status !== ReviewStatus.PENDING_REVIEW;
    await recruiters.create({
      userId: u._id, agencyName: r.agency, approvalStatus: r.status, submittedAt: joined,
      ...(decided ? { reviewedBy: admin._id, reviewedAt: new Date(+joined + DAY), reviewNote: r.note } : {}),
    });
    recruiterUsers.push({ id: u.id, name: r.name, status: r.status });
    await audit.record({ actor: { id: u.id, role: 'RECRUITER', name: r.name }, action: 'RECRUITER_REGISTERED', entity: { type: 'RecruiterProfile', id: u.id }, metadata: { name: r.name, agencyName: r.agency }, at: joined });
    if (decided) {
      const action = r.status === ReviewStatus.APPROVED ? 'RECRUITER_ACCOUNT_APPROVED' : 'RECRUITER_ACCOUNT_CHANGES_REQUESTED';
      await audit.record({
        actor: adminRef, action, entity: { type: 'RecruiterProfile', id: u.id }, reason: r.note,
        previousState: { approvalStatus: 'PENDING_REVIEW' }, newState: { approvalStatus: r.status }, at: new Date(+joined + DAY),
      });
    }
  }

  // Companies + recruiter links (every approved recruiter represents 2-3 companies)
  // Original demo logos (drawn for this project) for three of the four approved companies; the fourth stays text-only on purpose.
  const LOGO_FILES: Record<string, string> = { 'Northwind Labs': 'northwind-labs', 'Helix Retail Group': 'helix-retail', 'Orchard Health': 'orchard-health' };
  const logoUrlFor = (company: string): string | undefined => {
    const file = LOGO_FILES[company];
    const src = join(process.cwd(), 'src/scripts/assets/logos', `${file}.png`);
    if (!file || !existsSync(src)) return undefined;
    const pubDir = join(resolve(process.env.UPLOAD_DIR ?? './storage/private'), 'public');
    mkdirSync(pubDir, { recursive: true });
    const name = `${randomUUID()}.png`;
    copyFileSync(src, join(pubDir, name));
    return `/api/public/assets/${name}`;
  };
  const logos = new Map<string, string | undefined>(COMPANIES.map((c) => [c.name, logoUrlFor(c.name)]));
  const companyDocs: { id: string; _id: Types.ObjectId }[] = [];
  for (const [i, c] of COMPANIES.entries()) {
    const owner = recruiterUsers[i % 3];
    const created = ago(30 - i * 4);
    const decided = c.status === ReviewStatus.APPROVED;
    const doc = await companies.create({
      name: c.name, industry: c.industry, location: c.location, country: c.country, approvalStatus: c.status, logoUrl: logos.get(c.name),
      submittedAt: created, createdBy: owner.id,
      ...(decided ? { reviewedBy: admin._id, reviewedAt: new Date(+created + DAY / 2) } : {}),
    });
    companyDocs.push(doc);
    await audit.record({ actor: { id: owner.id, role: 'RECRUITER', name: owner.name }, action: 'COMPANY_SUBMITTED', entity: { type: 'Company', id: doc.id }, metadata: { name: c.name }, at: created });
    if (decided) await audit.record({ actor: adminRef, action: 'COMPANY_APPROVED', entity: { type: 'Company', id: doc.id }, previousState: { approvalStatus: 'PENDING_REVIEW' }, newState: { approvalStatus: 'APPROVED' }, at: new Date(+created + DAY / 2) });
  }
  for (const [ri, r] of recruiterUsers.slice(0, 3).entries()) {
    const mine = new Set([ri, (ri + 1) % 5, ...(ri === 0 ? [2] : [])]);
    for (const ci of mine) {
      const ok = COMPANIES[ci].status === ReviewStatus.APPROVED;
      await links.create({ recruiterUserId: r.id, companyId: companyDocs[ci]._id, approvalStatus: ok ? ReviewStatus.APPROVED : ReviewStatus.PENDING_REVIEW, ...(ok ? { reviewedBy: admin._id, reviewedAt: ago(20) } : {}) });
    }
  }


  // Job requests -> jobs. Mix of states so every queue and tab has something in it.
  const JOBS: { title: string; dept: string; ci: number; ri: number; state: 'PUBLISHED' | 'PENDING' | 'CHANGES' | 'REJECTED'; skills: string[]; min: number; max: number; type: string; mode: string; basis: 'HOUR' | 'MONTH'; hrs?: number; exp: number }[] = [
    { title: 'Senior Backend Engineer', dept: 'Engineering', ci: 0, ri: 0, state: 'PUBLISHED', skills: ['Node.js', 'MongoDB', 'AWS'], min: 30, max: 50, type: 'PART_TIME', mode: 'REMOTE', basis: 'HOUR', hrs: 20, exp: 5 },
    { title: 'Product Designer', dept: 'Design', ci: 0, ri: 0, state: 'PUBLISHED', skills: ['Figma', 'Design Systems', 'User Research'], min: 20, max: 35, type: 'PART_TIME', mode: 'REMOTE', basis: 'HOUR', hrs: 15, exp: 3 },
    { title: 'Data Analyst', dept: 'Analytics', ci: 1, ri: 1, state: 'PUBLISHED', skills: ['SQL', 'Python', 'Power BI'], min: 1400, max: 2000, type: 'PART_TIME', mode: 'HYBRID', basis: 'MONTH', hrs: undefined, exp: 2 },
    { title: 'Store Operations Manager', dept: 'Operations', ci: 1, ri: 1, state: 'PUBLISHED', skills: ['Retail Operations', 'Team Leadership'], min: 1800, max: 2400, type: 'FULL_TIME', mode: 'ONSITE', basis: 'MONTH', hrs: undefined, exp: 6 },
    { title: 'Clinical Data Coordinator', dept: 'Clinical', ci: 2, ri: 2, state: 'PUBLISHED', skills: ['EHR', 'Data Entry', 'HIPAA'], min: 18, max: 26, type: 'CONTRACT', mode: 'ONSITE', basis: 'HOUR', hrs: 25, exp: 3 },
    { title: 'Full-stack Engineer', dept: 'Engineering', ci: 2, ri: 2, state: 'PUBLISHED', skills: ['TypeScript', 'React', 'Node.js'], min: 35, max: 55, type: 'CONTRACT', mode: 'REMOTE', basis: 'HOUR', hrs: 30, exp: 4 },
    { title: 'Marketing Specialist', dept: 'Marketing', ci: 0, ri: 0, state: 'PENDING', skills: ['SEO', 'Content Strategy'], min: 10, max: 18, type: 'PART_TIME', mode: 'REMOTE', basis: 'HOUR', hrs: 12, exp: 3 },
    { title: 'Accountant', dept: 'Finance', ci: 1, ri: 1, state: 'PENDING', skills: ['Financial Reporting', 'Excel'], min: 900, max: 1300, type: 'PART_TIME', mode: 'HYBRID', basis: 'MONTH', hrs: undefined, exp: 4 },
    { title: 'Logistics Coordinator', dept: 'Operations', ci: 3, ri: 2, state: 'CHANGES', skills: ['Logistics', 'ERP'], min: 12, max: 16, type: 'CONTRACT', mode: 'ONSITE', basis: 'HOUR', hrs: 24, exp: 2 },
    { title: 'Intern, Data Science', dept: 'Analytics', ci: 0, ri: 0, state: 'REJECTED', skills: ['Python'], min: 300, max: 500, type: 'INTERNSHIP', mode: 'REMOTE', basis: 'MONTH', hrs: undefined, exp: 0 },
  ];
  const liveJobs: { id: any; recruiterId: string; companyId: any; title: string; jobNumber: string; dept: string }[] = [];
  for (const [i, j] of JOBS.entries()) {
    const recruiter = recruiterUsers[j.ri];
    const company = companyDocs[j.ci];
    const cur = currencyForCountry(COMPANIES[j.ci].country);
    const fx = cur === 'INR' ? 60 : 1; // sample rates are written in dollar-like units
    const minor = (n: number) => Math.round(n * fx * 100);
    const spec = {
      title: j.title, department: j.dept, location: COMPANIES[j.ci].location, workMode: j.mode, employmentType: j.type, openings: int(1, 3),
      requirements: { experienceMin: j.exp, experienceMax: j.exp + 4, education: "Bachelor's degree or equivalent", technicalSkills: j.skills, softSkills: ['Communication', 'Ownership'], certifications: [], languages: ['English'] },
      compensation: { salaryMin: minor(j.min), salaryMax: minor(j.max), currency: cur, payBasis: j.basis, hoursPerWeek: j.basis === 'HOUR' ? j.hrs : undefined, benefits: ['Flexible hours', 'Paid on time'], bonus: j.basis === 'HOUR' ? 'Bonus for work delivered early' : undefined },
      contract: { probationMonths: 3, noticePeriodDays: 60, workingHours: j.basis === 'HOUR' ? `${j.hrs} hours/week` : j.type === 'PART_TIME' ? '20 hours/week' : '40 hours/week', ...(j.type === 'CONTRACT' ? { durationMonths: 12 } : {}) },
      details: { description: `We are hiring a ${j.title} to join ${COMPANIES[j.ci].name}. You will work closely with the team to deliver high-quality results.`, responsibilities: 'Own your deliverables end to end, collaborate across teams and keep stakeholders informed.', requiredDocuments: ['Resume'], specialInstructions: 'Client prefers candidates who can start within 60 days.' },
    };
    const submitted = ago(26 - i * 2);
    const n = await counters.next('job-request');
    const base = { requestNumber: `JR-${String(n).padStart(4, '0')}`, recruiterId: recruiter.id, companyId: company._id, spec, createdAt: submitted };
    const review = (action: string, note?: string, at = submitted) => ({ action, byId: action === 'SUBMITTED' ? recruiter.id : admin._id, byName: action === 'SUBMITTED' ? recruiter.name : admin.name, byRole: action === 'SUBMITTED' ? 'RECRUITER' : 'ADMIN', note, version: 1, at });
    const revisions = [{ version: 1, submittedAt: submitted, spec }];
    const ref = (id: string) => ({ type: 'JobRequest', id });
    const rec = { id: recruiter.id, role: 'RECRUITER', name: recruiter.name };
    const meta = { title: j.title, companyName: COMPANIES[j.ci].name, recruiterName: recruiter.name };

    if (j.state === 'PENDING') {
      const r = await jobRequests.create({ ...base, status: 'PENDING_ADMIN_REVIEW', version: 1, submittedAt: submitted, reviews: [review('SUBMITTED')], revisions });
      await audit.record({ actor: rec, action: 'JOB_CREATED', entity: ref(r.id), metadata: meta, at: submitted });
    } else if (j.state === 'CHANGES') {
      const at = new Date(+submitted + DAY);
      const r = await jobRequests.create({ ...base, status: 'CHANGES_REQUESTED', version: 1, submittedAt: submitted, reviews: [review('SUBMITTED'), review('CHANGES_REQUESTED', 'Please confirm the contract duration and add the client working hours.', at)], revisions });
      await audit.record({ actor: rec, action: 'JOB_CREATED', entity: ref(r.id), metadata: meta, at: submitted });
      await audit.record({ actor: adminRef, action: 'JOB_CHANGES_REQUESTED', entity: ref(r.id), reason: 'Please confirm the contract duration and add the client working hours.', at });
    } else if (j.state === 'REJECTED') {
      const at = new Date(+submitted + DAY);
      const r = await jobRequests.create({ ...base, status: 'REJECTED', version: 1, submittedAt: submitted, reviews: [review('SUBMITTED'), review('REJECTED', 'Internships are outside the roles we place.', at)], revisions });
      await audit.record({ actor: rec, action: 'JOB_CREATED', entity: ref(r.id), metadata: meta, at: submitted });
      await audit.record({ actor: adminRef, action: 'JOB_REJECTED', entity: ref(r.id), reason: 'Internships are outside the roles we place.', at });
    } else {
      const at = new Date(+submitted + DAY / 2);
      const r = await jobRequests.create({ ...base, status: 'APPROVED', version: 1, submittedAt: submitted, reviews: [review('SUBMITTED'), review('APPROVED', undefined, at)], revisions });
      const jn = await counters.next('job', 1001);
      const job = await jobs.create({ jobNumber: `JOB-${jn}`, jobRequestId: r._id, recruiterId: recruiter.id, companyId: company._id, status: 'PUBLISHED', spec, approvedBy: admin._id, approvedAt: at, publishedAt: at, createdAt: at });
      await jobRequests.updateOne({ _id: r._id }, { jobId: job._id });
      liveJobs.push({ id: job._id, recruiterId: recruiter.id, companyId: company._id, title: j.title, jobNumber: job.jobNumber, dept: j.dept });
      await audit.record({ actor: rec, action: 'JOB_CREATED', entity: ref(r.id), metadata: meta, at: submitted });
      await audit.record({ actor: adminRef, action: 'JOB_APPROVED', entity: ref(r.id), previousState: { status: 'PENDING_ADMIN_REVIEW' }, newState: { status: 'APPROVED', jobNumber: job.jobNumber, published: true }, at });
    }
  }

  // Candidates
  const candidateUsers: { id: string; _id: any; name: string; email: string; exp: number; salary: { amount: number; currency: string } }[] = [];
  for (let i = 0; i < 20; i++) {
    const name = `${FIRST[i]} ${LAST[(i * 7) % LAST.length]}`;
    const country = i < 14 ? 'IN' : pick(['GB', 'US', 'AE', 'SG']);
    const track = TRACKS[i % TRACKS.length];
    const [lo, hi] = SALARY[country];
    const exp = int(1, 12);
    const registered = ago(int(1, 28));
    const u = await users.create({
      email: emailOf(name), name, role: Role.CANDIDATE, createdAt: registered, passwordHash, emailVerified: true, // sign-in now requires a verified email
      country, currency: currencyForCountry(country), lastLoginAt: ago(int(0, 20)),
    });
    candidateUsers.push({ id: u.id, _id: u._id, name, email: u.email, exp, salary: { amount: Math.round((lo + (hi - lo) * Math.min(1, exp / 12)) / 1000) * 1000 * 100, currency: currencyForCountry(country) } });
    await candidates.create({
      userId: u._id, headline: track.headline, location: pick(CITIES[country]), skills: track.skills.slice(0, int(3, track.skills.length)),
      experienceYears: exp, expectedSalary: { amount: Math.round((lo + (hi - lo) * Math.min(1, exp / 12)) / 1000) * 1000 * 100, currency: currencyForCountry(country) },
      noticePeriodDays: pick([0, 15, 30, 60, 90]),
    });
    await audit.record({ actor: { id: u.id, role: 'CANDIDATE', name }, action: 'CANDIDATE_REGISTERED', entity: { type: 'User', id: u.id }, metadata: { name }, at: registered });
  }

  // Resumes (tiny real PDFs so downloads work) and 30 applications spread across the pipeline.
  const root = resolve(process.env.UPLOAD_DIR ?? './storage/private');
  const seedDir = join(root, 'seed');
  mkdirSync(seedDir, { recursive: true });
  const pdf = (title: string) => {
    const text = `BT /F1 20 Tf 72 720 Td (${title.replace(/[()\\]/g, '')}) Tj ET`;
    const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      `<< /Length ${text.length} >>\nstream\n${text}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    let out = '%PDF-1.4\n'; const offs: number[] = [];
    objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const x = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
    return Buffer.from(out);
  };
  const resumeOf = new Map<string, any>();
  for (const c of candidateUsers) {
    const key = `seed/${randomUUID()}.pdf`;
    const buf = pdf(`Resume - ${c.name}`);
    writeFileSync(join(root, key), buf);
    const d = await documents.create({ ownerId: c._id, type: 'RESUME', label: 'Resume', groupKey: 'resume', version: 1, status: 'ACTIVE', originalName: `Resume - ${c.name}.pdf`, mime: 'application/pdf', size: buf.length, storageKey: key });
    resumeOf.set(c.id, d._id);
  }

  const PATH = ['APPLIED', 'ADMIN_REVIEW', 'ADMIN_INTERVIEW', 'ADMIN_SHORTLISTED', 'SENT_TO_RECRUITER', 'RECRUITER_REVIEW', 'RECRUITER_APPROVED', 'INTERVIEW', 'SELECTED', 'CONTRACT', 'PLACED'];
  const EVENT: Record<string, string> = { ADMIN_SHORTLISTED: 'CANDIDATE_SHORTLISTED', SENT_TO_RECRUITER: 'CANDIDATE_SENT_TO_RECRUITER', RECRUITER_APPROVED: 'RECRUITER_APPROVED', SELECTED: 'CANDIDATE_SELECTED', WITHDRAWN: 'APPLICATION_WITHDRAWN' };
  const PLAN: [string, number][] = [['APPLIED', 6], ['ADMIN_REVIEW', 4], ['ADMIN_INTERVIEW', 2], ['ADMIN_SHORTLISTED', 3], ['SENT_TO_RECRUITER', 3], ['RECRUITER_REVIEW', 2], ['RECRUITER_APPROVED', 2], ['INTERVIEW', 3], ['SELECTED', 5], ['REJECTED', 3], ['WITHDRAWN', 1]];
  const targets = PLAN.flatMap(([s, n]) => Array<string>(n).fill(s));
  const taken = new Set<string>();
  for (const [i, target] of targets.entries()) {
    let job = liveJobs[(i * 5 + Math.floor(i / 6)) % liveJobs.length];
    // Mostly pair a job with candidates whose background fits it (candidate i has track i % 6), with some mismatches for realism.
    const TRACK_OF: Record<string, number> = { Engineering: 0, Analytics: 1, Design: 2, Operations: 3, Marketing: 4, Finance: 5, Clinical: 1 };
    const fits = candidateUsers.filter((_, ci) => ci % 6 === TRACK_OF[job.dept]);
    let cand = i % 4 === 3 || fits.length === 0 ? candidateUsers[(i * 3) % candidateUsers.length] : fits[Math.floor(i / 2) % fits.length];
    for (let k = 1; taken.has(`${cand.id}:${job.id}`); k++) cand = candidateUsers[(candidateUsers.indexOf(cand) + k) % candidateUsers.length];
    taken.add(`${cand.id}:${job.id}`);

    const steps = target === 'REJECTED' ? ['APPLIED', 'ADMIN_REVIEW', i % 2 ? 'ADMIN_SHORTLISTED' : 'ADMIN_REVIEW', 'REJECTED'].filter((v, idx, a) => idx === 0 || v !== a[idx - 1])
      : target === 'WITHDRAWN' ? ['APPLIED', 'ADMIN_REVIEW', 'WITHDRAWN'] : PATH.slice(0, PATH.indexOf(target) + 1);
    const applied = ago(Math.max(2, 24 - i) + steps.length);
    const roleFor = (st: string) => (['RECRUITER_REVIEW', 'RECRUITER_APPROVED'].includes(st) ? 'RECRUITER' : st === 'WITHDRAWN' ? 'CANDIDATE' : st === 'APPLIED' ? 'CANDIDATE' : 'ADMIN');
    const rec = recruiterUsers.find((r) => r.id === job.recruiterId)!;
    const who = (st: string) => (roleFor(st) === 'RECRUITER' ? { id: rec.id, name: rec.name } : roleFor(st) === 'CANDIDATE' ? { id: cand.id, name: cand.name } : { id: String(admin._id), name: admin.name });
    const history = steps.map((st, idx) => ({
      status: st, changedBy: who(st).id, changedByName: who(st).name, role: roleFor(st), at: new Date(+applied + idx * DAY * 0.8),
      ...(st === 'REJECTED' ? { reason: 'Profile does not match the requirements closely enough.' } : {}), ...(st === 'WITHDRAWN' ? { reason: 'Accepted another offer' } : {}),
    }));
    const n = await counters.next('application');
    const a = await applications.create({
      applicationNumber: `APP-${String(n).padStart(5, '0')}`, candidateId: cand._id, jobId: job.id, recruiterId: job.recruiterId, companyId: job.companyId,
      status: target, statusHistory: history, resumeDocumentId: resumeOf.get(cand.id), createdAt: applied,
      coverLetter: `Hello, I'm excited about the ${job.title} role and believe my ${cand.exp} years of experience are a strong fit.`,
      expectedSalary: cand.salary, noticePeriodDays: pick([0, 15, 30, 60]),
      ...(steps.length > 2 ? { adminScore: int(55, 95), resumeScore: int(50, 95), tags: pick([['strong-communicator'], ['fast-joiner'], ['relocating'], []]), adminNotes: 'Solid background; good communication in screening.' } : {}),
    });
    await audit.record({ actor: { id: cand.id, role: 'CANDIDATE', name: cand.name }, action: 'APPLICATION_CREATED', entity: { type: 'Application', id: a.id }, newState: { status: 'APPLIED' }, metadata: { applicationNumber: a.applicationNumber, jobTitle: job.title, candidateName: cand.name }, at: applied });
    const last = history.at(-1)!;
    const STATUS_NOTE: Record<string, string> = { ADMIN_SHORTLISTED: "You're shortlisted", SENT_TO_RECRUITER: 'Your profile was shared with the hiring company', INTERVIEW: 'You are in the interview stage', SELECTED: 'Congratulations — you were selected', PLACED: "You're placed — welcome aboard!", REJECTED: 'Update on your application', APPLIED: 'Application received' };
    await notificationsM.create({ userId: cand._id, title: `${STATUS_NOTE[target] ?? 'Application update'}: ${job.title}`, type: 'RECRUITMENT', link: `/candidate/applications/${a.id}`, read: i % 3 === 0, createdAt: last.at, event: 'APPLICATION_STATUS_CHANGED' });
    await emailsM.create({ to: cand.email, toName: cand.name, template: target === 'REJECTED' ? 'candidate-rejected' : 'application-received', subject: target === 'REJECTED' ? `An update on your application for ${job.title}` : `We received your application for ${job.title}`, status: i % 5 === 0 ? 'DELIVERED' : 'SENT', attempts: 1, sentAt: applied, createdAt: applied, nextAttemptAt: applied, provider: 'seed', related: { type: 'Application', id: a.id }, events: [{ status: 'QUEUED', at: applied }, { status: 'SENT', at: applied }] });
    if (steps.length >= 4 && target !== 'REJECTED' && target !== 'WITHDRAWN') {
      await notificationsM.create({ userId: rec.id, title: `New candidate: ${cand.name}`, description: job.title, type: 'RECRUITMENT', link: `/recruiter/candidates/${a.id}`, read: i % 2 === 0, createdAt: history[3].at });
    }
    for (const [idx, h] of history.slice(1).entries()) {
      await audit.record({ actor: { id: h.changedBy, role: h.role, name: h.changedByName }, action: EVENT[h.status] ?? 'APPLICATION_STATUS_CHANGED', entity: { type: 'Application', id: a.id }, reason: (h as any).reason, previousState: { status: history[idx].status }, newState: { status: h.status }, at: h.at });
    }
  }

  // Round one is ours: every candidate who reached our interview has one booked (upcoming) or held (past it).
  const ourRound = await applications.find({ status: { $nin: ['APPLIED', 'ADMIN_REVIEW', 'REJECTED', 'WITHDRAWN'] } }).lean();
  for (const [idx, a] of ourRound.entries()) {
    const held = a.status !== 'ADMIN_INTERVIEW';
    const when = new Date(Date.now() + (held ? -(9 + idx) : idx + 1) * DAY);
    when.setUTCHours(held ? 8 : 6 + idx, 0, 0, 0);
    const n = await counters.next('interview');
    await interviewsM.create({
      interviewNumber: `INT-${String(n).padStart(4, '0')}`, applicationId: a._id, jobId: a.jobId, candidateId: a.candidateId, recruiterId: a.recruiterId, scheduledBy: admin._id, stage: 'ADMIN',
      type: idx % 2 ? 'PHONE' : 'VIDEO', startsAt: when, durationMinutes: 30, timezone: 'Asia/Kolkata', round: 1,
      ...(idx % 2 ? {} : { meetingLink: 'https://meet.example.com/talentbridge-screening' }),
      interviewers: [{ name: admin.name }], instructions: 'A short chat with our team before we introduce you to the hiring company.',
      status: held ? 'COMPLETED' : 'SCHEDULED', history: [{ status: 'SCHEDULED', at: ago(12), byName: admin.name }, ...(held ? [{ status: 'COMPLETED', at: when, byName: admin.name }] : [])],
    });
  }

  // Interviews: upcoming ones for candidates in the interview stage, and held ones (with feedback) for those further along.
  const inInterview = await applications.find({ status: { $in: ['INTERVIEW', 'SELECTED', 'PLACED'] } }).lean();
  for (const [idx, a] of inInterview.entries()) {
    const rec = recruiterUsers.find((r) => r.id === String(a.recruiterId))!;
    const future = a.status === 'INTERVIEW';
    const when = new Date(Date.now() + (future ? (idx + 1) * 2 : -(4 + idx)) * DAY);
    when.setUTCHours(future ? 5 + idx : 9, 30, 0, 0);
    const type = (['VIDEO', 'IN_PERSON', 'PHONE'] as const)[idx % 3];
    const n = await counters.next('interview');
    const iv = await interviewsM.create({
      interviewNumber: `INT-${String(n).padStart(4, '0')}`, applicationId: a._id, jobId: a.jobId, candidateId: a.candidateId, recruiterId: a.recruiterId, scheduledBy: admin._id,
      type, startsAt: when, durationMinutes: pick([30, 45, 60]), timezone: pick(['Asia/Kolkata', 'Europe/London', 'America/New_York']), round: 1,
      ...(type === 'VIDEO' ? { meetingLink: 'https://meet.example.com/talentbridge-demo' } : type === 'IN_PERSON' ? { location: 'Client office, 4th floor reception' } : {}),
      interviewers: [{ name: rec.name }], instructions: 'Please join five minutes early and have your resume handy.', notes: 'Probe notice period and salary flexibility.',
      status: future ? 'SCHEDULED' : 'COMPLETED', history: [{ status: 'SCHEDULED', at: ago(7), byName: 'Admin' }, ...(future ? [] : [{ status: 'COMPLETED', at: when, byName: rec.name }])],
    });
    if (!future) {
      await feedbackM.create({ interviewId: iv._id, applicationId: a._id, authorId: rec.id, authorName: rec.name, authorRole: 'RECRUITER', overallRating: 4, technicalRating: 4, communicationRating: 5, cultureFit: 4,
        strengths: 'Clear communicator with solid fundamentals.', weaknesses: 'Limited exposure to large-scale systems.', recommendation: a.status === 'PLACED' ? 'STRONG_HIRE' : 'HIRE', notes: 'Would be a good addition to the team.' });
    }
  }

  // Every live opening has our commission set, the same as in production (nothing is published without one).
  const rulesM = app.get<Model<any>>(getModelToken(CommissionRuleDoc.name));
  await rulesM.deleteMany({ note: /^\[seed\]/ });
  for (const [idx, j] of (await jobs.find({ status: 'PUBLISHED' }).sort({ jobNumber: 1 }).lean()).entries()) {
    await rulesM.create({ scope: 'JOB', refId: j._id, refLabel: `${j.jobNumber} · ${j.spec?.title ?? ''}`, type: 'PERCENT', basisPoints: [1000, 1250, 1500][idx % 3], active: true, note: '[seed] set when approved', createdBy: admin._id });
  }

  // A recruiter asking to change one live opening and to close another, so Admin has examples to decide.
  const openJobs = await jobs.find({ status: 'PUBLISHED' }).sort({ jobNumber: 1 }).limit(2).lean();
  for (const [idx, j] of openJobs.entries()) {
    const n = await counters.next('job-change');
    const to = { ...j.spec, openings: (j.spec?.openings ?? 1) + 2 };
    await jobChanges.create({
      changeNumber: `JCR-${String(n).padStart(4, '0')}`, jobId: j._id, jobRequestId: j.jobRequestId, recruiterId: j.recruiterId, companyId: j.companyId,
      type: idx === 0 ? 'EDIT' : 'CLOSE', reason: idx === 0 ? 'The client has budget for two more people.' : 'We filled this role through another channel.', submittedAt: ago(1 + idx),
      ...(idx === 0 ? { spec: to, changes: [{ field: 'openings', label: 'Openings', from: j.spec?.openings ?? 1, to: to.openings }] } : { changes: [] }),
    });
  }

  // One candidate a recruiter sent back, and one request for more candidates, so the Approval Center has examples.
  const returned = await applications.findOne({ status: 'ADMIN_REVIEW' });
  if (returned) {
    const rec = recruiterUsers.find((r) => r.id === String(returned.recruiterId))!;
    const base = +new Date(returned.statusHistory.at(-1).at);
    const extra = ['ADMIN_SHORTLISTED', 'SENT_TO_RECRUITER', 'RECRUITER_REVIEW', 'ADMIN_REVIEW'].map((st, i) => ({
      status: st, changedBy: st === 'RECRUITER_REVIEW' || (st === 'ADMIN_REVIEW') ? rec.id : String(admin._id), changedByName: st === 'RECRUITER_REVIEW' || st === 'ADMIN_REVIEW' ? rec.name : admin.name,
      role: st === 'RECRUITER_REVIEW' || st === 'ADMIN_REVIEW' ? 'RECRUITER' : 'ADMIN', at: new Date(base + (i + 1) * 3_600_000 * 5), ...(st === 'ADMIN_REVIEW' ? { reason: 'Salary expectation is above our budget.' } : {}),
    }));
    await applications.updateOne({ _id: returned._id }, { $push: { statusHistory: { $each: extra } }, $set: { recruiterDecision: { type: 'REJECTED', reason: 'Salary expectation is above our budget.', at: new Date(base + 4 * 5 * 3_600_000), byName: rec.name, pending: true } } });
  }
  const someJob = liveJobs[0];
  await candidateRequestsM.create({ jobId: someJob.id, recruiterId: someJob.recruiterId, count: 3, reason: '[seed] Pipeline is thin — we need candidates with stronger cloud experience.', status: 'PENDING', createdAt: ago(2) });


  // Contracts for the selected candidates, one in each stage, driven through the real service so every rule and record is genuine.
  const contractsSvc = app.get(ContractsService);
  const contracts = app.get<Model<any>>(getModelToken(Contract.name));
  const staff = (id: any, role: Role, name: string): AuthUser => ({ id: String(id), role, name, email: '' });
  const adminUser = staff(admin._id, Role.ADMIN, admin.name);
  const selectedApps = await applications.find({ status: 'SELECTED' }).sort({ createdAt: 1 }).lean();
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  for (const [i, a] of selectedApps.entries()) {
    const rec = await users.findById(a.recruiterId).lean();
    const cand = await users.findById(a.candidateId).lean();
    if (!rec || !cand) continue;
    const recruiter = staff(rec._id, Role.RECRUITER, rec.name), candidate = staff(cand._id, Role.CANDIDATE, cand.name);
    const job = await jobs.findById(a.jobId).lean();
    const comp = job?.spec.compensation;
    const cur = comp?.currency ?? 'USD';
    const hourly = comp?.payBasis === 'HOUR';
    const terms = {
      title: job?.spec.title ?? 'Role', employmentType: job?.spec.employmentType ?? 'PART_TIME', currency: cur,
      salaryAmount: Math.round(((comp?.salaryMin ?? 100000) + (comp?.salaryMax ?? 100000)) / 2), salaryPeriod: hourly ? 'HOUR' as const : 'MONTH' as const,
      hoursPerWeek: hourly ? comp?.hoursPerWeek ?? 20 : undefined, startDate: day(i === 0 ? -120 : i === 1 ? -60 : 14), workingHours: hourly ? `${comp?.hoursPerWeek ?? 20} hours/week` : 'Flexible, about 20 hours/week', noticePeriodDays: 14,
      ...(job?.spec.employmentType === 'CONTRACT' || i === 1 ? { endDate: i === 1 ? day(20) : day(180) } : {}),
    };
    const creator = i === 0 ? adminUser : recruiter;
    const c: any = await contractsSvc.create({ applicationId: String(a._id), ...terms, ...(i === 0 ? { commissionPercent: 12 } : {}) } as never, creator);
    if (i === 3) continue; // stays a draft
    await contractsSvc.submit(c.id, creator);
    if (i === 4) continue; // waiting for Admin
    if (creator.role === Role.RECRUITER) await contractsSvc.approve(c.id, adminUser);
    else await contractsSvc.approve(c.id, recruiter);
    if (i === 2) continue; // waiting for the candidate
    await contractsSvc.approve(c.id, candidate);
    if (i === 0) await contractsSvc.requestChange(c.id, { salaryAmount: Math.round(terms.salaryAmount * 1.1), reason: 'Rate review after the first month' } as never, recruiter);
  }


  // Payments for the active contracts, left at different points so every tab and action has something to show.
  const paymentsSvc = app.get(PaymentsService);
  const monthsBack = (n: number) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 7); };
  const activeContracts = await contracts.find({ status: 'ACTIVE' }).sort({ contractNumber: 1 }).lean();
  for (const [i, c] of activeContracts.entries()) {
    const rec = await users.findById(c.recruiterId).lean();
    const recruiter = staff(rec!._id, Role.RECRUITER, rec!.name);
    const cand = await users.findById(c.candidateId).lean();
    const candidate = staff(cand!._id, Role.CANDIDATE, cand!.name);
    const make = async (back: number) => (await paymentsSvc.generate({ contractId: String(c._id), period: monthsBack(back) }, adminUser) as any).id as string;
    const paid = (id: string, ref: string) => paymentsSvc.markPaid(id, { method: 'Bank transfer', reference: ref }, recruiter);
    if (i === 0) {
      const done = await make(3); await paid(done, 'UTR-30011'); await paymentsSvc.confirmReceived(done, { amountReceived: (await paymentsSvc.get(done, adminUser)).gross }, adminUser);
      await paymentsSvc.sendPayout(done, { method: 'UPI', reference: 'UPI-77120' }, adminUser); await paymentsSvc.confirmPayout(done, candidate);
      const due = await make(2); await paid(due, 'UTR-30958'); await paymentsSvc.confirmReceived(due, { amountReceived: (await paymentsSvc.get(due, adminUser)).gross }, adminUser);
      const toConfirm = await make(1); await paid(toConfirm, 'UTR-31407');
    } else {
      await make(1);
      const disputed = await make(2); await paid(disputed, 'UTR-29001'); await paymentsSvc.dispute(disputed, 'Nothing arrived under this reference', adminUser);
    }
  }


  // Salary follows the contracts and payments above; leave one delay waiting for Admin and one already published.
  const later = (ymd: string, n: number) => new Date(Date.parse(ymd) + n * 86_400_000).toISOString().slice(0, 10);
  const salarySvc = app.get(SalaryService);
  await salarySvc.runGeneration();
  const salaryM = app.get<Model<any>>(getModelToken(Salary.name));
  for (const [i, c] of activeContracts.entries()) {
    const rec = await users.findById(c.recruiterId).lean();
    const recruiter = staff(rec!._id, Role.RECRUITER, rec!.name);
    const open = await salaryM.findOne({ contractId: c._id, period: monthsBack(0) }).lean();
    if (!open) continue;
    if (i === 0) await salarySvc.reportDelay(String(open._id), { reason: 'The company is waiting for its client to release funds after the audit', newPayDate: later(open.payDate, 10) }, recruiter);
    else await salarySvc.reportDelay(String(open._id), { reason: 'Our payment partner is closed for a public holiday week', newPayDate: later(open.payDate, 14) }, adminUser);
  }

  await notificationsM.insertMany([
    { userId: admin._id, title: 'New recruiter: Omar Haddad', description: 'Gulf Bridge Recruitment is waiting for approval', type: 'RECRUITMENT', link: '/admin/approvals', read: false },
    { userId: admin._id, title: 'New company: Kestrel Fintech', description: 'Submitted by Marcus Webb', type: 'RECRUITMENT', link: '/admin/approvals', read: false },
    { userId: admin._id, title: 'Job request: Marketing Specialist', description: 'Priya Nair · Northwind Labs', type: 'RECRUITMENT', link: '/admin/approvals', read: false },
    { userId: admin._id, title: 'New application: Ananya Rao', description: 'Senior Backend Engineer', type: 'RECRUITMENT', link: '/admin/applications', read: true },
  ]);
  await emailsM.create({ to: `failed.example@${DOMAIN}`, toName: 'Example', template: 'welcome', subject: 'Welcome to Talentbridge', status: 'FAILED', attempts: 4, failureReason: 'Mailbox unavailable (seed example)', provider: 'seed', nextAttemptAt: new Date(), events: [{ status: 'QUEUED', at: new Date() }, { status: 'FAILED', at: new Date(), detail: 'Mailbox unavailable (seed example)' }] });

  // Demo website content: show the seeded client companies as wordmarks. Admin replaces this from Settings > Website content.
  const siteModel = app.get<Model<any>>(getModelToken(SiteContentDoc.name));
  const existingSite = await siteModel.findOne({ key: 'landing' }).lean();
  if (!existingSite) {
    const data = JSON.parse(JSON.stringify(DEFAULT_SITE_CONTENT));
    data.trustedBy = { enabled: true, label: 'Trusted by:', companies: COMPANIES.filter((c) => c.status === ReviewStatus.APPROVED).map((c) => ({ name: c.name, logo: logos.get(c.name) ?? '', url: '' })) };
    data.contact = { email: 'hello@talentbridge.test', phone: '', address: '', hours: 'Usually within one business day' };
    await siteModel.create({ key: 'landing', data });
  }

  console.log(`Seeded: ${RECRUITERS.length} recruiters, ${COMPANIES.length} companies, ${JOBS.length} job requests (6 live jobs), 20 candidates, 33 applications, 5 contracts, 6 payments, salary, 2 delays and payslips (+ audit history).`);
  console.log(`All seeded accounts use password: ${SEED_PASSWORD}   e.g. ${emailOf(RECRUITERS[0].name)}`);
  await app.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
