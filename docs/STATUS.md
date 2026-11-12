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
- Last full runs (12 Nov):
  - API unit 82/82 and API e2e 144/144, after S1-03.
  - The 5 recruitment e2e tests pass on their own.
  - Shared tests 24/24.
  - Web typecheck and lint are clean.

## In progress
**S1-04**: jobs and the public careers page (branch `main`). The API and web code are done and pushed.
- Left:
  1. **Run the browser tests** (`npm run test:e2e -w @alora/web`): they have never run on SHC.
     - Start the API built (`npm run build -w @alora/api`, then `node dist/main` from `apps/api`) with
       `RATE_LIMITS_DISABLED=true JOBS_ENABLED=false`.
     - Start the web app with `npm run dev -w @alora/web`.
     - The last attempt exited with Playwright code 4 before any test ran. Check `apps/web/e2e/global-setup.ts`
       first; it re-seeds the demo company.
     - New or changed specs: `careers.spec.ts` and `csp.spec.ts`. Older ones: S1-02 moved them to SHC
       logins/pages.
  2. Re-run the full API e2e suite with `recruitment.e2e-spec.ts` included.
  3. Tick S1-02, S1-03 and S1-04 in ROADMAP once the browser tests pass.
- Known limits:
  - `CAREERS_FRAME_ANCESTORS` is one list per deployment, not per company.
  - The root layout sets `noindex` on every page, careers pages included. Revisit when a company wants
    Google to list its jobs.

## Next up
**S1-05**: the applicant pipeline.
- Stage moves: screened, interview, offer, hired, rejected, withdrawn.
- Interview booking, notes and scores.
- Candidate emails.
- **Hire** creates the user and staff record and starts onboarding.

Recruitment must be live by week 2.

## Blockers / waiting on Ayo
See ROADMAP "Needs Ayo": company name/logo, agreement + DPA, ICO, Azure and domain.

## Session log

| Date | Agent | Task | Outcome |
|---|---|---|---|
| 2026-11-12 | Claude Code | S1-03, S1-04 | UK staff/company records (S-003); recruitment API and careers pages; API e2e 144/144 plus recruitment 5/5; browser tests not yet run. |
| 2026-11-11 | Claude Code | S1-02 | UK roles/permissions; web and staff app stripped and rebranded SHC. The API e2e suite was fully green only on 12 Nov, after the branding fixes. |
| 2026-11-11 | Claude Code | S1-01 | Foundation imported; API stripped to the workforce core; separate dev DB with fresh migrations; tests rewritten. |
