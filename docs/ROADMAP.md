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
- [x] **S3-04** `agent` Supervisions and appraisals: schedule, record, remind.
- [x] **S3-05** `agent` Manager dashboard: who can't work yet and why, what expires this month, hiring at a glance.
- [x] **S3-06** `agent` Staff phone app (reuse the caregiver app): documents, training, holiday, messages.
- [x] **S3-08** `agent` SHC's own look (navy and gold), nothing shared with Primordial's design (S-018).
- [ ] **S3-07** `agent`+`human` UK hosting (Azure UK South), domain, email sender; manager training.

## Stage 4 — Extras (agreed 13 Nov 2026)
- [x] **S4-01** `agent` Staff spreadsheet import: existing staff, checks and training in one upload (S-019).
- [x] **S4-02** `agent` CQC inspection pack: one click per person, flags anything missing (S-020).
- [x] **S4-03** `agent` Design polish pass (Ayo: "it can be better"): staff record in tabs, list readiness (S-021).
- [x] **S4-04** `agent` AI help for admins and managers: drafting (job adverts, interview questions, supervision
  write-ups) and "Ask our policies" (S-022). Needs a working `ANTHROPIC_API_KEY` in `.env` (`human`).
- [ ] **S4-05** `agent` AI reads uploaded certificates (fills dates/type for a manager to confirm). Only after Michael's
  data processing agreement names Anthropic.

## Stage 5 � Fit to Support Health Care Ltd (agreed 14 Nov 2026, from Michael's website)
Michael's company is Support Health Care Ltd: supported living (complex care, DoLS/MHA), outreach, home care, and a
healthcare staffing service (RGN/RMN/RNLD nurses, HCAs, AHPs, doctors) across nine English regions, with international
recruitment. These make SHC fit that business.
- [x] **S5-01** `agent` Clinical and staffing roles (RGN, RMN, RNLD, HCA, AHP, doctor) with NMC/HCPC/GMC register
  checks: panel on the Checks tab, number formats, renewal reminders, inspection pack line, import column (S-027).
- [x] **S5-02** `agent` Regions: company list of regions, region on each staff member, region filters everywhere.
- [x] **S5-03** `agent` Complex-care training: Oliver McGowan, MCA/DoLS, mental health, PBS/restrictive practice,
  epilepsy, clinical skills (optional).
- [x] **S5-04** `agent` Sponsored worker (visa) tracker: visa route/expiry, CoS, sponsor-duty reminders, list for
  Home Office visits. Store and remind only; no immigration advice.
- [ ] **S5-05** `agent` Online applications on their website: company logo on the careers page, an "Apply online"
  link for their Join Us page.
- Later, priced separately: booking agency shifts for NHS/client organisations, timesheets and invoicing.

## Ideas after go-live
- [ ] Visa sponsorship tracker (only if Michael sponsors workers).
- AI is **admins and managers only** (S-022). A person always confirms; AI never scores, ranks or rejects candidates
  (UK GDPR automated decisions, bias).

## Needs Ayo (`human`)
- [x] Company name: **SHC** (confirmed by Ayo, 12 Nov 2026). Logo: the navy shield with a gold S (S-018).
- [ ] Company website address (to allow the careers page to be embedded there, CAREERS_FRAME_ANCESTORS).
- [ ] Signed agreement + data processing agreement; ICO registration.
- [ ] Azure subscription for UK hosting, and a domain for the platform.
- [ ] Repo visibility: currently public — make private before real client data or pricing logic is added.
