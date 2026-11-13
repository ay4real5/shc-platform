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
  `uk_company`, `recruitment`, `hiring_pipeline`, `right_to_work`, `dbs`, `references`, `signatures`, `health`, `care_certificate`, `holiday`, `supervisions`.
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
Stage 3. Done: S3-01 (expiry alerts for every check, S-012), S3-02 (Care Certificate + training matrix, S-013),
S3-03 (holiday allowance, balance, absence and Bradford factor, S-014), S3-04 (supervisions, appraisals and spot checks,
S-015), S3-05 (manager dashboard, S-016), S3-06 (staff phone app catches up with the website, S-017), S3-08 (SHC's own navy and gold look, S-018). Next is S3-07
(go-live), which needs Ayo. The phone app has not been tried on a real phone since S3-06: run `npm run start -w @alora/mobile`
and open it in Expo Go with `EXPO_PUBLIC_API_URL` set to the computer's network address.

How to run the browser suite locally:
1. Build the API: `npm run build -w @alora/api`.
2. Start it from `apps/api` with `RATE_LIMITS_DISABLED=true JOBS_ENABLED=false node dist/main`.
3. Start the web app: `npm run dev -w @alora/web`.
4. Run the tests: `npm run test:e2e -w @alora/web`. This re-seeds the demo company.

## Next up
**Stage 3 (weeks 5–6)**, in order:
- S3-07: go-live (Azure UK South, domain, email sender; manager training).

Open items:
- Retention for unsuccessful applicants (six months).
- `CAREERS_FRAME_ANCESTORS` is one list per deployment.
- Careers pages are `noindex`.
- An "application received" email to the applicant.
- DBS policy periods could become company settings.
- Holiday: Statutory Sick Pay, carry-over and leavers' holiday pay are not built (S-014).

## Blockers / waiting on Ayo
See ROADMAP "Needs Ayo": company name/logo, agreement + DPA, ICO, Azure and domain.

## Session log

| Date | Agent | Task | Outcome |
|---|---|---|---|
| 2026-11-13 | Claude Code | S3-08 | Ayo: SHC and Primordial are different companies, so nothing visual may be shared. New look (navy and gold): Source Serif/Sans fonts, shield logo and icons, navy top bar with drop-downs (was Primordial's sidebar), new sign-in, dashboard header, careers frame, emails and phone app; "Unlock Primordial Health" text fixed in the phone app; design guard in lint. Browser 25/25, API unit 88/88, mobile 41/41, Android bundle builds. |
| 2026-11-13 | Claude Code | S3-06 | Staff app: "Needs doing" on home, contracts and policies to read and sign (file opened in the phone's viewer), health questionnaire, supervision records to read and sign, Care Certificate progress, holiday left and working days; UK dates and £. Mobile typecheck/lint clean, unit 41/41, Android bundle builds, every API call checked against the dev API as the demo care worker. Not yet tried on a real phone. |
| 2026-11-13 | Claude Code | S3-05 | Manager dashboard (one API call; can't work yet + why, expiring 30 days, needs attention, hiring); demo data gives established staff full files. API e2e 179/179, API unit 88/88, browser 25/25. |
| 2026-11-12 | Claude Code | S3-04 | Supervisions, appraisals and spot checks: due dates from intervals, book/record (notes encrypted), person reads and signs, day-before reminders and overdue alerts job, overview page, intervals in settings, new supervisions:manage permission. API e2e 178/178, API unit 88/88, shared 44/44, browser 24/24. |
| 2026-11-12 | Claude Code | S3-03 | Holiday allowance (5.6 weeks, max 28, pro-rata, override), working days per request, balance check, office-recorded leave approved at once, sickness + Bradford factor, Holiday & absence report, leave year setting. API e2e 175/175, API unit 88/88, shared 42/42, browser 23/23. |
| 2026-11-12 | Claude Code | S3-02 | Care Certificate (16 standards signed off by an assessor, auto-awarded, 12-week due date) and training matrix page. API e2e 172/172 (seed test now checks per-type counts), API unit 88/88, shared 37/37, browser 22/22. |
| 2026-11-12 | Claude Code | S3-01 | Expiry alerts for all checks: UK-morning job, wording per check, DBS office-only, renewals supersede old credentials. Browser 21/21; compliance/training/staff e2e 19/19; unit ok. |
| 2026-11-12 | Claude Code | S2-01..S2-06 | Right to Work, DBS, references, documents to sign + onboarding packs, health questionnaire, CQC ready-to-start. Final run: browser 21/21, API unit 85/85, API e2e 167/167, shared 34/34. |
| 2026-11-12 | Claude Code | S1-05 | Hiring pipeline (stages, interviews, timeline, candidate emails, hire → login + staff record); API e2e 152/152, browser 16/16. |
| 2026-11-12 | Claude Code | S1-03, S1-04 | UK staff/company records (S-003); recruitment API and careers pages; API e2e 144/144 plus recruitment 5/5; browser tests not yet run. |
| 2026-11-11 | Claude Code | S1-02 | UK roles/permissions; web and staff app stripped and rebranded SHC. The API e2e suite was fully green only on 12 Nov, after the branding fixes. |
| 2026-11-11 | Claude Code | S1-01 | Foundation imported; API stripped to the workforce core; separate dev DB with fresh migrations; tests rewritten. |
