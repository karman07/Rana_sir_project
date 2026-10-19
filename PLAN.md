# Recruitment Management Platform — Build Plan

Stack: Next.js (TS, Tailwind, shadcn/ui, TanStack Query, RHF+Zod, Recharts, Framer Motion) + NestJS (TS, MongoDB/Mongoose).
Layout: monorepo — `apps/web` (Next.js), `apps/api` (NestJS), `packages/shared` (enums, Zod schemas, types).
Confirmed decisions:
- **Email:** Resend. Sending uses a Mongo-backed outbox (`Email` docs with status + retry worker), so no Redis is needed.
- **Payments:** no gateway. Payments are mutual/manual: parties record them and the other side confirms (reference number, proof upload).
- **Currency:** every money record stores `amount` + `currency` in minor units. Display is localized from the user's location (profile country, falling back to geo-IP/`Accept-Language`) via `Intl.NumberFormat`. Contract money is never silently converted. Converted display uses an admin-managed rate table and is shown as "approx."
- **Files:** Multer, private disk storage (outside web root), authorized streaming download only.
- **Recruiters are agents:** one recruiter posts openings for many client companies. Admin approves the recruiter account, each company they represent, and each job request.

Priority order: Architecture → UX → Security → Data integrity → Business logic → Visual polish.

Rules for every part:
- Backend first (schema → service → thin controller → DTO validation → guards), then frontend (loading, error, empty states).
- Every workflow action: audit log + notification + queued email (once Part 9 exists; before that, emit the domain event only).
- Each part ends with a runnable, demoable state and role-permission checks.

---

## Part 0 — Monorepo & tooling
- pnpm workspace, `apps/web`, `apps/api`, `packages/shared`.
- ESLint/Prettier/tsconfig base, env handling, Docker Compose for MongoDB.
- Shared enums: roles, application statuses, job statuses, contract/payment/salary statuses, event names.
- Multer, Resend SDK and Intl currency utils added to dependencies.
- **Done when:** both apps boot, web can call an API health endpoint.

## Part 1 — Design system & app shells (frontend only)
- Tailwind tokens for light + dark palettes (cream / forest green / gold), Geist/Inter fonts, next-themes with persistence + system preference.
- Primitives: Button, Input, Select, DatePicker, Modal, Drawer, Tabs, Toast, ConfirmationDialog, Skeleton, Avatar, StatusBadge, EmptyState.
- Composite: AppShell, collapsible Sidebar (drawer on mobile), Topbar, Breadcrumb, DataTable (search/filter/sort/paginate/column visibility/export/bulk, card view on mobile), StatCard variants, ChartCard, Timeline, Stepper.
- Three shells: `/admin`, `/recruiter`, `/candidate` with role-specific nav (full admin sidebar from spec §11).
- Error pages: 404, 403, 500, session expired, network error.
- **Done when:** a component gallery page + three empty shells look correct in both themes.

## Part 2 — Backend foundation
- NestJS config, Mongo connection, global validation pipe, exception filter, Helmet, CORS, rate limiting, Mongo query sanitization.
- Common: pagination/sort/filter helpers, base schema (timestamps, soft delete), response envelope.
- Event bus (`@nestjs/event-emitter`) with typed domain events (spec §66).
- **Done when:** health, config and event bus tested.

## Part 3 — Auth, users, RBAC
- `User`, `CandidateProfile`, `RecruiterProfile`, `Company` schemas.
- Recruiter = agent: `RecruiterProfile` has `approvalStatus` (PENDING_REVIEW / APPROVED / REJECTED / SUSPENDED); `Company` belongs to a creating recruiter and has its own `approvalStatus`. Many-to-many recruiter↔company via `RecruiterCompany` link (with its own approval).
- Unapproved recruiters can log in but see a "pending admin review" screen and cannot post jobs.
- Location capture: country/timezone/currency preference on every user.
- JWT access + rotating refresh tokens in HTTP-only cookies, password hashing, email verification + forgot/reset tokens.
- Roles + permission guard (`@Roles`, `@Permissions`), ownership-scoping helpers.
- Frontend: login, candidate/recruiter registration, admin login, forgot/reset, verify email; route protection middleware; session-expiry handling.
- **Done when:** each role logs in and lands in its own shell; cross-role access returns 403.

## Part 4 — Audit log & seed data
- `AuditLog` module (actor, role, action, entity, prev/new state, reason); immutable.
- Seed script: 5 recruiters, 20 candidates, 5 companies, 10 jobs, 30 applications, plus placeholders for later modules, extended each part.
- **Done when:** `pnpm seed` yields a populated DB.

## Part 5 — Dashboards (all three roles)
- Admin: "what needs my attention today" layout (approvals, candidates to review, upcoming interviews, payment/salary issues, expiring contracts) + stat cards + funnel.
- Recruiter: pipeline strip + action-needed list.
- Candidate: "where do I stand / what's next" status tracker.
- Backend aggregation endpoints `GET /analytics/admin/overview` etc. (initial version).
- **Done when:** dashboards render from real API data with skeleton/empty states.

## Part 6 — Jobs & job requests
- `JobRequest`, `Job` schemas; statuses DRAFT → PENDING_ADMIN_REVIEW → APPROVED / CHANGES_REQUESTED / REJECTED; public: PUBLISHED / CLOSED.
- Recruiter 5-step form (RHF + Zod, draft save, resubmit). First step picks one of the recruiter's **approved companies** (or adds a new company → goes to admin review). Recruiter can post multiple openings across multiple companies; list grouped/filterable by company.
- Per-job currency selector defaulting to the company/user's location currency.
- Admin job-request review: approve / request changes / reject, history of every change in audit.
- Candidates only ever see APPROVED+PUBLISHED jobs (enforced in query layer).
- **Done when:** full request → review → changes → resubmit → publish loop works.

## Part 7 — Approval Center & review states
- Generic `ApprovalItem` aggregation. First categories: **recruiter registrations, company additions, job requests**; others plug in as parts land.
- Every reviewable entity carries a `reviewStatus` (PENDING_REVIEW / APPROVED / CHANGES_REQUESTED / REJECTED), `submittedAt`, `reviewedBy`, `reviewedAt`, `reviewNote`.
- Admin sees a **Pending** vs **Reviewed** split everywhere: counts on sidebar items, "Needs review" badge, filter tabs (Pending / Changes requested / Approved / Rejected), oldest-first by default, aging indicator.
- Recruiter sees the same states on their own submissions and what they must fix.
- UI: category tabs, priority, quick approve/reject/request-changes with confirmation.
- **Done when:** job requests are actioned from here.

## Part 8 — Candidate job portal & applications
- Candidate profile (tabs, resume upload), job search (debounced, filters, pagination, save job), job detail, apply form.
- `Application` with `statusHistory`, unique application ID.
- **RecruitmentWorkflowService**: valid transition map, role checks, admin override with reason (spec §76).
- File upload module: Multer disk storage in a private directory, randomised stored names, type/size/name validation, streamed authorized download (never static-served).
- **Done when:** candidate applies and tracks status with timeline.

## Part 9 — Notifications & email core
- `Notification` module + bell dropdown + full page with deep links.
- `Email`, `EmailTemplate` schemas; Resend provider adapter (console adapter in dev), Mongo outbox + retry worker (exponential backoff), logs with failure reason, webhook for delivered/bounced status.
- Event handlers: event → audit + notification + email (spec §90). Retrofit Parts 6–8 events.
- All 23 templates + variable rendering (spec §31–32).
- **Done when:** every existing workflow action produces audit, notification and email record.

## Part 10 — Admin screening & recruiter review
- `CandidateScreening`: score, notes, tags, resume score, job match.
- Ranking table per job, screening workspace, candidate comparison view, shortlist/reject/send-to-recruiter.
- Recruiter candidate review: approve / reject / request changes / request more candidates — all return to Admin as Approval Center items; Admin decides next step.
- Recruiter-scoped candidate visibility.
- **Done when:** full application flow APPLIED → RECRUITER_APPROVED works with returns to Admin.

## Part 11 — Interviews
- `Interview`, `InterviewFeedback`; scheduling, reschedule, cancel, no-show, calendar view, detail page, feedback form with recommendation.
- Workflow transitions to INTERVIEW → SELECTED/REJECTED; events/emails to candidate and recruiter.
- **Done when:** schedule → complete → feedback → select works for all three roles.

## Part 12 — Contracts & versioning
- `Contract`, `ContractVersion` (immutable versions, prev/new values, reason, approval status).
- Approval chain: Admin → Recruiter → Candidate → ACTIVE; EXPIRING/EXPIRED job; change-request workflow creating new versions.
- Contract timeline, expiry tracking, lists (active / pending / expiring / changes).
- **Done when:** change request approved → new version, history preserved.

## Part 13 — Commission & payments (manual / mutual)
- `Commission` rules (percentage/fixed; recruiter/job/contract overrides) + admin settings UI.
- **CommissionCalculationService** (integer minor units, rounding rules, unit-tested); frontend only displays results.
- `Payment` with transaction ID, statuses, manual reference + proof file, ledger; soft-delete only. No gateway: recruiter/company records payment sent → admin confirms received (both sides tracked, mismatch → DISPUTED). Admin records payout to candidate → candidate confirms receipt.
- **Done when:** ₹100,000 → ₹15,000 / ₹85,000 style calculations verified by tests.

## Part 14 — Salary & delays
- `Salary` records generated from active contract version; recruiter submits; statuses UPCOMING…DISPUTED.
- Salary-delay workflow: recruiter report → Approval Center → admin publishes → candidate sees reason/date.
- Contract version changes recalculate *future* salary/payments only.
- **Done when:** delay flow end to end, with audit and emails.

## Part 15 — Payslips & PDF
- `Payslip` immutable snapshot of figures at generation; server-side PDF (e.g. `@react-pdf/renderer` or Puppeteer); stored as Document.
- Candidate payslip portal (view/download), email on generation, admin payslip list.
- **Done when:** historical payslips remain unchanged after a contract revision.

## Part 16 — Documents
- `Document` model with owner, type, version, entity link, access rules; admin/recruiter/candidate views; secure signed download.
- Wire resumes, contracts, payslips, offer letters.
- **Done when:** access tests prove candidates see only their own files.

## Part 17 — Communication center (admin)
- Email dashboard: sent / scheduled / failed, logs, detail page, retry; template editor with variable preview; notification settings.

## Part 18 — Analytics & export
- Aggregation pipelines with indexes: recruitment, financial, recruiter performance, candidate analytics; funnel chart; period switchers.
- CSV/Excel export for candidates, applications, jobs, payments, commissions, salary, payslips, contracts.
- Admin / recruiter / candidate analytics pages.

## Part 19 — Admin completeness
- Recruiters/companies/candidates lists + profile pages (spec §53–54), activity timelines, platform settings (company info, logo, currency, roles & permissions, document/payment/email config).
- Global Cmd/Ctrl+K command palette across entities.

## Part 20 — Landing page
- Hero, how it works, companies, candidates, process, trust, stats, testimonials, FAQ, contact, footer — premium, own identity.

## Part 21 — Polish & hardening
- UX, responsive (candidate mobile-first), accessibility, dark-mode review, animation review, form validation sweep.
- Performance: index review, query profiling, caching, lazy loading.
- Security review: authz tests per endpoint, file upload checks, rate limits, cookie flags.
- Role-permission integration test suite; AI extension points (`ResumeParser`, `CandidateScorer` interfaces, no fake AI).

---

## Suggested milestones
| Milestone | Parts | Outcome |
|---|---|---|
| M1 Foundation | 0–5 | Auth, shells, dashboards, seed data |
| M2 Recruitment | 6–11 | Job → apply → screen → interview |
| M3 Money | 12–16 | Contracts, commission, salary, payslips, docs |
| M4 Ops & launch | 17–21 | Comms, analytics, admin, landing, polish |

## Key risks / decisions to confirm
1. Exchange-rate source for approximate converted display (manual admin table vs rates API) — start manual.
2. Multer disk storage is single-server; moving to multiple servers later needs shared storage behind the same file service interface.
3. Can a company be shared by several recruiters (agents)? Plan assumes yes, each link admin-approved.
