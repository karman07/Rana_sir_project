import { Role } from '@rms/shared';

export type Access = 'yes' | 'own' | 'approved' | 'none';
export interface MatrixRow { capability: string; note?: string; admin: Access; recruiter: Access; candidate: Access }
export interface MatrixGroup { area: string; rows: MatrixRow[] }

/**
 * Who can do what, in words. This is documentation of rules that are enforced in code (guards, scoping and the tests), shown so Admin can see
 * the whole picture in one place. "own" means only their own records; "approved" means once Admin has approved their account.
 */
export const PERMISSION_MATRIX: MatrixGroup[] = [
  { area: 'Accounts', rows: [
    { capability: 'Sign up themselves', admin: 'none', recruiter: 'yes', candidate: 'yes', note: 'Recruiter accounts wait for Admin approval' },
    { capability: 'Create recruiter accounts', admin: 'yes', recruiter: 'none', candidate: 'none' },
    { capability: 'Approve, reject or suspend accounts', admin: 'yes', recruiter: 'none', candidate: 'none' },
  ] },
  { area: 'Companies & jobs', rows: [
    { capability: 'Add a client company', admin: 'yes', recruiter: 'approved', candidate: 'none', note: 'Reviewed by Admin' },
    { capability: 'Request a job opening', admin: 'yes', recruiter: 'approved', candidate: 'none', note: 'Admin reviews every opening before it is published' },
    { capability: 'Approve and publish jobs', admin: 'yes', recruiter: 'none', candidate: 'none' },
    { capability: 'Browse published jobs', admin: 'yes', recruiter: 'yes', candidate: 'yes' },
  ] },
  { area: 'Candidates & applications', rows: [
    { capability: 'Apply for a job', admin: 'none', recruiter: 'none', candidate: 'yes' },
    { capability: 'See candidates and their applications', admin: 'yes', recruiter: 'own', candidate: 'own', note: 'A recruiter sees a candidate only after Admin sends them' },
    { capability: 'Screen, score and shortlist', admin: 'yes', recruiter: 'none', candidate: 'none' },
    { capability: 'Approve or return a sent candidate', admin: 'yes', recruiter: 'own', candidate: 'none' },
    { capability: 'Schedule and run interviews', admin: 'yes', recruiter: 'own', candidate: 'none' },
  ] },
  { area: 'Contracts', rows: [
    { capability: 'Draft a contract', admin: 'yes', recruiter: 'own', candidate: 'none' },
    { capability: 'Approve a contract', admin: 'yes', recruiter: 'own', candidate: 'own', note: 'In order: Admin, recruiter, then the candidate' },
    { capability: 'Propose a change to a live contract', admin: 'yes', recruiter: 'own', candidate: 'none', note: 'A recruiter\'s change waits for Admin' },
    { capability: 'End a contract early', admin: 'yes', recruiter: 'none', candidate: 'none' },
  ] },
  { area: 'Money', rows: [
    { capability: 'See the commission and the platform\'s earnings', admin: 'yes', recruiter: 'none', candidate: 'none', note: 'Never shown to anyone else, anywhere' },
    { capability: 'Set commission rules', admin: 'yes', recruiter: 'none', candidate: 'none' },
    { capability: 'Record that a company has paid', admin: 'yes', recruiter: 'own', candidate: 'none' },
    { capability: 'Confirm money received and record payouts', admin: 'yes', recruiter: 'none', candidate: 'none' },
    { capability: 'Confirm they received their pay', admin: 'none', recruiter: 'none', candidate: 'own' },
    { capability: 'Report a salary delay', admin: 'yes', recruiter: 'own', candidate: 'none', note: 'Published to the candidate only after Admin approves it' },
    { capability: 'See and download payslips', admin: 'yes', recruiter: 'none', candidate: 'own' },
  ] },
  { area: 'Documents & data', rows: [
    { capability: 'Open a document', admin: 'yes', recruiter: 'own', candidate: 'own', note: 'A recruiter never opens a candidate\'s contract copy or payslip' },
    { capability: 'Export spreadsheets', admin: 'yes', recruiter: 'own', candidate: 'own', note: 'Each file holds only what that person can see on screen' },
    { capability: 'View analytics', admin: 'yes', recruiter: 'own', candidate: 'own' },
  ] },
  { area: 'Platform', rows: [
    { capability: 'Edit email templates and notifications', admin: 'yes', recruiter: 'none', candidate: 'none' },
    { capability: 'Change platform settings', admin: 'yes', recruiter: 'none', candidate: 'none' },
    { capability: 'Read the audit log', admin: 'yes', recruiter: 'none', candidate: 'none' },
  ] },
];

export const ROLES_IN_MATRIX = [Role.ADMIN, Role.RECRUITER, Role.CANDIDATE] as const;
