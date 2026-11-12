# Roadmap — SHC care workforce platform

A multi-company platform for UK care providers (home care / domiciliary and supported living): **recruitment,
onboarding & compliance, staff management**. First customer: Michael's company (SHC, about 50+ staff). Built on the
Primordial foundation (see [DECISIONS.md](DECISIONS.md) S-001).

Agreed delivery (proposal of 10 Nov 2026): **6 weeks** — recruitment live by week 2, onboarding & compliance by
week 4, staff management + staff app by week 6.

Owner tags: `agent` = any coding agent; `human` = needs Ayo (accounts, legal, client information).

## Stage 1 — Foundation and recruitment (weeks 1–2)
- [x] **S1-01** `agent` Copy the Primordial foundation; remove patient, visit, EVV, billing, clinical, payroll,
  portal, referral, report, insight and assistant code from the API; fresh migrations on a separate database.
- [x] **S1-02** `agent` Remove the same features from the web dashboard and the mobile app; clean `@alora/shared`
  (permissions, roles, notification types) of home-health items.
- [x] **S1-03** `agent` UK basics: care roles (registered manager, care coordinator, recruiter, team leader,
  senior care worker, care/support worker), job categories, £, dd/mm/yyyy, National Insurance number, UK
  postcodes and phone numbers, Europe/London default, SHC/product branding.
- [x] **S1-04** `agent` Jobs and the public careers page (embeddable on the company website); mobile-friendly
  application form capturing full employment history with gaps explained (CQC Schedule 3).
- [x] **S1-05** `agent` Applicant pipeline: applied → screened → interview → offer → hired (or rejected/withdrawn),
  interview booking, notes and scores, candidate emails; **hire** creates the staff member and starts onboarding.

## Stage 2 — Onboarding & compliance (weeks 3–4)
- [x] **S2-01** `agent` Right to Work: share-code (eVisa) and manual document checks recorded with who/when/how,
  time-limited permission follow-up dates and reminders. Digital ID (IDSP) later.
- [x] **S2-02** `agent` DBS: enhanced with adult barred list — certificate number and date only (no copies),
  Update Service subscription and status-check reminders.
- [x] **S2-03** `agent` References: automatic emailed request with a secure one-time form; responses land on file.
- [x] **S2-04** `agent` Contracts and policies signed online (reuse document e-signing); onboarding pack per role.
- [x] **S2-05** `agent` Health declaration (special category data — restricted access).
- [x] **S2-06** `agent` "% ready to start" checklist built on CQC Regulation 19 / Schedule 3; nobody is marked
  ready until every required item is done (reuse the onboarding checklist).

## Stage 3 — Staff management and go-live (weeks 5–6)
- [x] **S3-01** `agent` Expiry alerts for Right to Work, DBS, training, driving licence and insurance (reuse the
  credential expiry job).
- [x] **S3-02** `agent` Training and Care Certificate tracking (reuse Academy courses and credentials).
- [x] **S3-03** `agent` Holiday (5.6-week statutory entitlement, pro-rata) and absence.
- [ ] **S3-04** `agent` Supervisions and appraisals: schedule, record, remind.
- [ ] **S3-05** `agent` Manager dashboard: who can't work yet and why, what expires this month, hiring at a glance.
- [ ] **S3-06** `agent` Staff phone app (reuse the caregiver app): documents, training, holiday, messages.
- [ ] **S3-07** `agent`+`human` UK hosting (Azure UK South), domain, email sender; manager training.

## Needs Ayo (`human`)
- [x] Company name: **SHC** (confirmed by Ayo, 12 Nov 2026). Logo: the teal S mark for now.
- [ ] Company website address (to allow the careers page to be embedded there, CAREERS_FRAME_ANCESTORS).
- [ ] Signed agreement + data processing agreement; ICO registration.
- [ ] Azure subscription for UK hosting, and a domain for the platform.
- [ ] Repo visibility: currently public — make private before real client data or pricing logic is added.
