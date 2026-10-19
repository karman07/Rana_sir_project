# Recruitment Platform

- `backend/` — NestJS API (port 4100, prefix `/api`)
- `frontend/` — Next.js web app (all roles: `/admin`, `/recruiter`, `/candidate`)
- `shared/` — `@rms/shared` enums, domain events, money utils (build with `npm run build` after changes)
- `admin/`, `supplier/` — untouched scaffolds, unused

## Run
```
cd shared && npm i && npm run build
cd ../backend && cp .env.example .env && npm i && npm run start:dev
cd ../frontend && cp .env.example .env.local && npm i && npm run dev
```
MongoDB (no Docker needed): `cd backend && mongod --dbpath ./.mongo-data`, or point `MONGODB_URI` at any instance (default `mongodb://127.0.0.1:27017/recruitment`).

API responses: `{ success, data, meta? }` or `{ success: false, error: { code, message, details? } }`.
Tests: `npm test` (unit) and `npm run test:e2e` (needs MongoDB running).

## Auth
- First admin: set `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `backend/.env`, then `cd backend && npm run create-admin` (safe to re-run; resets the password). Sign in at `/admin-login`.
- Admin adds recruiters at `/admin/recruiters` → "Add recruiters" (several at once). Each gets an invite link to set a password (shown to the admin and logged by the API until Resend is wired in Part 9).
- Recruiters who self-register are `PENDING_REVIEW` until an admin approves them.
- Google sign-in: create an OAuth **Web** client in Google Cloud Console, add your frontend origin (e.g. `http://localhost:3000`) under *Authorized JavaScript origins*, and put the client id in `backend/.env` as `GOOGLE_CLIENT_ID`. The button appears automatically; without it Google sign-in is hidden and the endpoint returns 503.
- Set `WEB_ORIGIN` in `backend/.env` to the exact URL the frontend runs on (CORS + invite/reset links).

## Seed data (development)
`cd backend && npm run seed` creates 5 recruiters (3 approved, 1 pending, 1 changes requested), 5 companies, 20 candidates and their audit history. All use password `Password123!` (e.g. `priya.nair@seed.talentbridge.test`). `npm run seed -- --reset` recreates them. Jobs, applications, interviews, contracts, payments, salaries and payslips are added to the seed as those modules are built.

## URL map
| Area | URLs |
|---|---|
| Public site | `/`, `/jobs`, `/jobs/:id`, `/for-companies`, `/for-candidates`, `/how-it-works`, `/contact` |
| Sign in / up | `/login`, `/register`, `/admin-login`, `/forgot-password` |
| Candidate app | `/candidate/*` |
| Recruiter app | `/recruiter/*` |
| Admin app | `/admin/*` |
| API | `http://localhost:4100/api` (public endpoints under `/api/public/*`) |

## Email
Set `RESEND_API_KEY` and `EMAIL_FROM` in `backend/.env` to send real email. Without a key the API logs emails instead of sending (they still appear in Admin > Email Center). For delivery/bounce tracking, point a Resend webhook at `/api/webhooks/resend` and set `RESEND_WEBHOOK_SECRET`.

## How hiring works

1. **Our interview first.** A candidate who applies is reviewed by Admin, who schedules an interview (`stage: ADMIN`). Admin can only shortlist after that interview has been held (Admin can waive it with a reason). Candidates who are not shortlisted never reach the recruiter. Recruiters never see these interviews.
2. **The recruiter's interview second.** Shortlisted candidates are sent to the recruiter, who approves, schedules their own interview (`stage: RECRUITER`), and selects the candidate to hire.
3. **Payments.** The recruiter *releases* the company's payment; Admin is notified, confirms it arrived, then releases the candidate's share. If a salary is late, the recruiter reports the delay and Admin approves what is shown to the candidate.
4. **Changing a live opening.** Recruiters can't edit or close a published job directly. They send an edit request or a closure request (`/jobs/:id/change-requests`); Admin approves or declines it from the Approval Center (`JOB_CHANGE`). Only Admin can close a job directly.
