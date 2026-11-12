# Status — SHC care workforce platform

## Current state
- Repo created 11 Nov 2026 from the Primordial foundation. Company name confirmed as **SHC** (Michael's company).
- **Stage 1 (recruitment) and Stage 2 (onboarding and compliance) are done** (12 Nov):
  - careers page and application form (CQC history with explained gaps, referees);
  - pipeline with interviews, then hire, which creates the login and staff record;
  - references (one-time links, verified);
  - Right to Work (share code or manual, follow-ups);
  - DBS (Update Service status checks, manager risk decisions);
  - contracts and policies signed online, with onboarding packs per job role;
  - health questionnaire (encrypted, managers only);
  - the CQC "ready to start" checklist (Schedule 3 items tagged).
- Dev database `shc` on the Neon dev server. Migrations: `init`, `audit_logs_partitioning`, `uk_staff_record`,
  `uk_company`, `recruitment`, `hiring_pipeline`, `right_to_work`, `dbs`, `references`, `signatures`, `health`.
- Local `.env` (not committed) has its own JWT secret and encryption key.
- Demo seed:
  - "Demo Care Services (FAKE DATA)", Europe/London, logins `*@demo.shc.test`, password `Demo-Password-1!`.
  - Admins use 2FA with the demo key in `demo-seed.ts`.
  - Careers page at `/careers/demo-care`.
  - Staff have fake Right to Work and DBS records behind their credentials.
- **Email is not connected** (no provider in `.env`).
  - Candidate emails, welcome links and reference requests are recorded as "not sent".
  - The office is shown the links to pass on.
  - Email goes live with hosting (Azure).

## In progress
Nothing: Stage 2 finished. See the session log for the last test results.

How to run the browser suite locally:
1. Build the API: `npm run build -w @alora/api`.
2. Start it from `apps/api` with `RATE_LIMITS_DISABLED=true JOBS_ENABLED=false node dist/main`.
3. Start the web app: `npm run dev -w @alora/web`.
4. Run the tests: `npm run test:e2e -w @alora/web`. This re-seeds the demo company.

## Next up
**Stage 3 (weeks 5–6)**, in order:
- S3-01: expiry alerts for all checks (credential job; Right to Work and DBS already feed it).
- S3-02: training and the Care Certificate.
- S3-03: holiday (5.6 weeks, pro-rata) and absence.
- S3-04: supervisions and appraisals.
- S3-05: staff app, which also needs documents to sign and the health questionnaire.
- S3-06: go-live.

Open items:
- Retention for unsuccessful applicants (six months).
- `CAREERS_FRAME_ANCESTORS` is one list per deployment.
- Careers pages are `noindex`.
- An "application received" email to the applicant.
- DBS policy periods could become company settings.

## Blockers / waiting on Ayo
See ROADMAP "Needs Ayo": company name/logo, agreement + DPA, ICO, Azure and domain.

## Session log

| Date | Agent | Task | Outcome |
|---|---|---|---|
| 2026-11-12 | Claude Code | S2-01..S2-06 | Right to Work, DBS, references, documents to sign + onboarding packs, health questionnaire, CQC ready-to-start. Final run: browser 21/21, API unit 85/85, API e2e 167/167, shared 34/34. |
| 2026-11-12 | Claude Code | S1-05 | Hiring pipeline (stages, interviews, timeline, candidate emails, hire → login + staff record); API e2e 152/152, browser 16/16. |
| 2026-11-12 | Claude Code | S1-03, S1-04 | UK staff/company records (S-003); recruitment API and careers pages; API e2e 144/144 plus recruitment 5/5; browser tests not yet run. |
| 2026-11-11 | Claude Code | S1-02 | UK roles/permissions; web and staff app stripped and rebranded SHC. The API e2e suite was fully green only on 12 Nov, after the branding fixes. |
| 2026-11-11 | Claude Code | S1-01 | Foundation imported; API stripped to the workforce core; separate dev DB with fresh migrations; tests rewritten. |
