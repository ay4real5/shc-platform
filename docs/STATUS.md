# Status — SHC care workforce platform

## Current state
- Repo created 11 Nov 2026 from the Primordial foundation (`ay4real5/Kayyo-alora_health-` @ 54cea0d).
- **API stripped to the workforce core** (S1-01): auth/2FA, users, roles and custom roles, audit log, agency
  settings, staff profiles, credentials with expiry alerts, availability, time off, onboarding checklist, Academy
  training, documents (company/staff files, UK HR types, e-signing), secure messaging, notifications (email/push/
  SMS outbox), real-time sockets, compliance (dashboard, audit-log search, UK GDPR security checklist).
- Separate **dev database** `shc` on the same Neon server as Primordial's dev DB (never Primordial's data). Fresh
  migrations: `20261111000000_init` + `20261111000100_audit_logs_partitioning`.
- Local `.env` (not committed) has its own JWT secret and encryption key.
- Demo seed: "Demo Care Services (FAKE DATA)", Europe/London, logins `*@demo.shc.test`, password
  `Demo-Password-1!` (admins have 2FA with the demo key in `demo-seed.ts`).

## In progress
**S1-02** — strip the web dashboard and staff app (branch `main`, committed step by step).
- Done:
  - `@alora/shared`: UK roles (S-002), permissions, job roles, leave types, notification types and onboarding
    checks.
  - API: time off uses `time_off:*`, pay uses `pay:read`; live-monitor socket removed; SMS numbers are UK (+44);
    company profile uses a UK postcode.
  - Web: patient, visit, EVV, billing, portal, referral and report pages removed; SHC name and mark
    (`src/lib/brand.ts`, `components/brand/logo.tsx`); staff-focused home page; UK labels (£, postcode, job
    role).
  - Staff app: Home tab (getting started, checks to renew, training); visit, pay and open-shift screens removed;
    "SHC Staff" identity (`uk.shc.staff`, own icons, no Primordial Expo project, placeholder API URL in `eas.json`).
  - Dev DB: old US built-in roles and permissions deleted (a one-off; the startup sync leaves roles that aren't in
    code alone).
- Left:
  - Run the browser tests (`npm run test:e2e -w @alora/web`) against a local API and dashboard; they were updated
    but not yet run.
  - The staff record (API + schema) is still US-shaped (`ssn_encrypted`, `state`, `tax_filing_status`,
    `per_visit_rate`, `ivr_code`, `max_patients`, `service_area_zip_codes`, lat/lng). The web form hides those
    fields. Reshape it into a UK record (NI number, right-to-work fields…) in S1-03.
  - Mobile `lib/visits.ts`, `lib/offline*.ts`, `lib/reminders.ts` still carry visit-era helpers (harmless, unused
    paths).

## Next up
S1-03 (UK basics), then S1-04/S1-05 (careers page and applicant pipeline) — recruitment must be live by week 2.

## Blockers / waiting on Ayo
See ROADMAP "Needs Ayo": company name/logo, agreement + DPA, ICO, Azure and domain.

## Session log

| Date | Agent | Task | Outcome |
|---|---|---|---|
| 2026-11-11 | Claude Code | S1-02 | UK roles/permissions; web and staff app stripped and rebranded SHC; API e2e green after role changes. |
| 2026-11-11 | Claude Code | S1-01 | Foundation imported; API stripped to the workforce core; separate dev DB with fresh migrations; tests rewritten. |
