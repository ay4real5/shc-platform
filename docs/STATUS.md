# Status — SHC care workforce platform

## Current state
- Repo created 11 Nov 2026 from the Primordial foundation (`ay4real5/Kayyo-alora_health-` @ 54cea0d).
- **API: the workforce core plus recruitment**:
  - Workforce core: auth/2FA, users, roles, audit log, company settings, staff records (UK), credentials with
    expiry alerts, availability, time off, onboarding checklist, Academy training, documents with e-signing,
    messaging, notifications, compliance.
  - Recruitment (S1-04): job adverts, the public careers page and applications.
- Separate **dev database** `shc` on the Neon dev server. Migrations: `init`, `audit_logs_partitioning`,
  `uk_staff_record`, `uk_company`, `recruitment`.
- Local `.env` (not committed) has its own JWT secret and encryption key.
- Demo seed:
  - "Demo Care Services (FAKE DATA)", Europe/London, logins `*@demo.shc.test`, password `Demo-Password-1!`.
  - Admins have 2FA with the demo key in `demo-seed.ts`.
  - Careers page at `/careers/demo-care`, with 2 open jobs, 1 draft and 6 fake applications.
- Earlier runs (12 Nov):
  - API unit 82/82 and API e2e 144/144, after S1-03.
  - The 5 recruitment e2e tests pass on their own.
  - Shared tests 24/24.
  - Web typecheck and lint are clean.

## In progress
Nothing. **Stage 1 (foundation and recruitment) is done.** Recruitment works end to end:
- a job advert, then the public careers page and application form (with explained gaps and referees);
- screening, interviews with scores, the offer;
- hire, which creates the login and staff record and starts onboarding.

Tests at the end of S1-05 (12 Nov):
- API unit 85/85 and API e2e 152/152;
- shared 25/25;
- browser suite 16/16;
- typecheck and lint clean.

How to run the browser suite locally:
1. Build the API: `npm run build -w @alora/api`.
2. Start it from `apps/api` with `RATE_LIMITS_DISABLED=true JOBS_ENABLED=false node dist/main`.
3. Start the web app: `npm run dev -w @alora/web`.
4. Run the tests: `npm run test:e2e -w @alora/web`.

## Next up
**S2-01**: Right to Work (share code / eVisa and manual document checks, follow-up dates and reminders). After that:
- S2-02: DBS;
- S2-03: automatic reference requests (the referees are already on each application);
- S2-04: contracts and policies;
- S2-05: health declaration;
- S2-06: the CQC "ready to start" checklist.

Open items:
- Retention schedule for unsuccessful applicants (six months; S-004).
- `CAREERS_FRAME_ANCESTORS` is one list per deployment.
- Careers pages are `noindex` like the rest of the app.
- Optional: an "application received" email to the applicant.

## Blockers / waiting on Ayo
See ROADMAP "Needs Ayo": company name/logo, agreement + DPA, ICO, Azure and domain.

## Session log

| Date | Agent | Task | Outcome |
|---|---|---|---|
| 2026-11-12 | Claude Code | S1-05 | Hiring pipeline (stages, interviews, timeline, candidate emails, hire → login + staff record); API e2e 152/152, browser 16/16. |
| 2026-11-12 | Claude Code | S1-03, S1-04 | UK staff/company records (S-003); recruitment API and careers pages; API e2e 144/144 plus recruitment 5/5; browser tests not yet run. |
| 2026-11-11 | Claude Code | S1-02 | UK roles/permissions; web and staff app stripped and rebranded SHC. The API e2e suite was fully green only on 12 Nov, after the branding fixes. |
| 2026-11-11 | Claude Code | S1-01 | Foundation imported; API stripped to the workforce core; separate dev DB with fresh migrations; tests rewritten. |
