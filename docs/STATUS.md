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
**S1-02** — remove patient/visit/EVV/billing screens from `apps/web` and `apps/mobile`; clean `@alora/shared`.
The web and mobile apps still contain Primordial screens and won't fully work against this API yet.
Next step: delete web routes under `src/app/(app)` for schedule, monitor, evv, patients, physicians, billing,
reports, payroll, referrals, my-pay and the portal; update `components/layout/navigation.ts`; then typecheck.

## Next up
S1-03 (UK basics), then S1-04/S1-05 (careers page and applicant pipeline) — recruitment must be live by week 2.

## Blockers / waiting on Ayo
See ROADMAP "Needs Ayo": company name/logo, agreement + DPA, ICO, Azure and domain.

## Session log

| Date | Agent | Task | Outcome |
|---|---|---|---|
| 2026-11-11 | Claude Code | S1-01 | Foundation imported; API stripped to the workforce core; separate dev DB with fresh migrations; tests rewritten. |
