## Hirepool

## (working name)

## AI Relevancy Packages & End-to-End Hiring Pipeline (ATS)

## Includes Careers Page links, external applications, and configurable application forms

Two connected features: (1) turn a job description into scored, tiered candidate packages, and (2) run the entire hiring pipeline — including a public careers-page link that accepts applications from outside Hirepool — end to end inside the platform.


## Feature 1 — JD-Based AI Relevancy Packages

Company pastes a job title + description once. Hirepool extracts what the role actually needs, scores every candidate against it, and lets the company buy a ready-made, tiered candidate batch instead of manually filtering.

## JD parsing

When a JD is submitted, it is wrapped in a fixed, admin-editable prompt template (stored in config, not hardcoded in code) that instructs the AI to return the JD's requirements in one exact structured format: required skills (array), role/title, minimum experience, and domain. This structured JSON — not free-text AI output — is what feeds the filter.

## Scoring & batching

A deterministic, explainable scoring engine (rule-based, not the AI guessing) compares that structured requirement set against every eligible candidate's profile (skills overlap, role match, experience match, domain match, each weighted) and produces a relevancy percentage per candidate. Candidates are grouped into four batches, each shown with its live candidate count:

- 100% — near-exact match on skills, role, and experience

- 90%+

- 75%+

- 50%+

Company sees all 4 batches as cards with counts. They can browse a batch on-platform using the normal unlock flow, or buy the entire batch as a downloadable package.

## Package pricing

Price scales with candidate count in the batch, via admin-configurable price bands:

| Candidates in package | Price |
| --- | --- |
| 1–10 |   |
| 11–50 |   |
| 51–200 |   |
| 200+ | Custom/contact sales |

Package purchase is a separate one-time Razorpay flow from subscriptions/unlocks — its own line in the company's invoice history and the Admin ledger — and does not consume the company's monthly unlock quota.

## Database additions

- job_requirements_parsed (id, job_id, extracted_skills jsonb, extracted_role, extracted_experience_level, extracted_domain)

- candidate_relevancy_scores (id, job_id, candidate_id, relevancy_percent, tier) — recomputed when the JD is edited or on a schedule as new candidates get approved

- relevancy_packages (id, job_id, tier, candidate_count, price, purchased_by_company_id, purchased_at, downloaded_at)

- jd_parsing_prompt_template — single admin-editable config value holding the exact prompt used for JD extraction


## Feature 2 — End-to-End Job Catalog & Hiring Pipeline (ATS)

A company runs an entire hiring cycle inside Hirepool: job creation, a public careers-page link that accepts external applicants, shortlisting, custom rounds, interviews, offer, and joining — with a permanent historical record per job.

## Job creation & Careers Page link

- Company creates a job with a custom Job ID (company-defined, unique per company), title, and description (optional — a job can exist with just a title)

- Hirepool auto-generates a public, shareable Careers Page application link for that job, which the company can embed as an "Apply" button on their own external careers page

- Anyone can apply through this link — including people who have never registered or been verified on Hirepool. This is the external application path, separate from Hirepool's own verified-candidate database.

## Application forms — Simple / Detailed / Foreign / Custom

When generating the Careers Page link, the company chooses which application form external applicants fill out (Workday-style, structured, not a resume upload):

- Simple — name, contact details, plus the minimum required fields to compute a relevancy score (skills, role, experience)

- Detailed — everything in Simple, plus full work history, education, and other in-depth fields, closer to a complete application

- Foreign — a variant for international candidates: adds nationality, passport/visa status, work-authorization status, relocation willingness, in addition to the base fields

- Custom — company builds its own field set from a simple form builder (add/remove/reorder fields, mark required vs optional) if none of the three presets fit

All required fields exist specifically so an external applicant's submission can be scored for relevancy the same way an internal Hirepool profile is — without required structured fields, an external application can't be placed into a relevancy batch.

## Verified vs External/Careers badge

When a company opens a job's applicant list, every candidate shows one of two badges:

- Verified — an existing Hirepool candidate whose profile has already passed platform verification (Phase 4's Track 1)

- External/Careers — someone who applied only through the public careers-page link and has no verified Hirepool profile

Both badge types can be shortlisted, scored, and moved through rounds — the badge is purely informational so the company knows how much trust to place in the data.

## Getting candidates onto a job

- AI relevancy path (Feature 1) — if a JD was provided, the relevancy-batched candidate list (Verified Hirepool candidates) feeds directly into this job's pipeline as suggestions

- External applications — anyone who applied via the Careers Page link and its structured form, auto-scored into the same relevancy batches using their form answers

- Manual path — company uses the normal Company Portal search/filter and clicks "Add to Job" for any Job ID, with or without a JD

A Shortlist button lets the company select one or more candidates (Verified or External) and shortlist them in bulk for that job.

## Candidate notification on shortlist


- Verified candidates — in-app notification + email: "You've been shortlisted by [Company] for [Job Title]." Visible immediately in their existing Hirepool dashboard/My Applications tab.

- External applicants — email only, saying they've been shortlisted and asking them to complete verification/registration on Hirepool to proceed — this is how external applicants convert into full Verified candidates over time.

- A daily digest notification reminds candidates (verified ones, via the app) of any pending action rather than spamming on every micro-update.

## Rounds (fully custom, company-defined)

Default suggested template: Shortlisted Coding Round Interview Round Offer Joining — but companies can add, rename, reorder, or remove rounds freely per job.

## Coding round

- Runs entirely on Hirepool's own inbuilt compiler (same Piston-API-based engine as the Contest module)

- Company can pick existing questions from Hirepool's master coding question dataset, or create their own — defining the problem description, function signature (parameter names/types, return type), starter code, and full test cases (visible + hidden), same structure as the platform's own question bank

- Custom questions support multiple languages plus SQL (via a free in-browser SQLite engine, e.g. sql.js — zero cost)

- Custom questions are private to that company/job, stored separately from the public question bank

## MCQ round / section

- Hirepool maintains a master MCQ list covering core CS concepts (DSA, OS, DBMS, networks, OOP, etc.) and each supported programming language/framework

- Company can select existing questions from this master list, or add their own MCQs manually for a job-specific round

## Interview round

Conducted on-platform via an embedded video call using Jitsi Meet (free, open-source, no API key) — company schedules a slot, both sides join via a generated meeting link inside Hirepool.

After each round, the company manually updates the candidate's result: Pass / Fail / On Hold, with a score field

and free-text notes — this triggers the candidate's next-stage notification automatically.

## Offer & joining

- Company uploads/generates an offer letter for a candidate who cleared all rounds; candidate sees it in their dashboard and can Accept or Decline in-platform

- On acceptance, a joining-formalities checklist opens: document upload (ID proof, previous offer/relieving letters, etc.)

- Background verification (BGV) is performed by an external agency — Hirepool only tracks its status as a manual field the company/admin updates (Pending In Progress Cleared Flagged); no live BGV API integration needed

## Analytics per job (persists forever, even on reopened jobs)

- Full funnel: Shortlisted Coding Round Interview Round Offer Joined, with counts and drop-off rate at each stage, split by Verified vs External source

- Average score per round, average time-in-stage, time-to-hire

- Full candidate-by-candidate history: every round, score, and outcome — visible however many years later the job is revisited


## Database additions

- jobs (id, company_id, custom_job_id, title, description nullable, status, careers_link_slug, form_type: simple/detailed/foreign/custom, custom_form_schema jsonb, created_at, closed_at)

- application_forms_master — predefined field templates for Simple / Detailed / Foreign forms

- external_applicants (id, job_id, form_data jsonb, relevancy_percent, tier, applied_at, converted_candidate_id nullable) — links to a real candidate_id once they verify/register

- job_applications (id, job_id, candidate_id nullable, external_applicant_id nullable, source: internal/external, verified_badge boolean, status, current_round_id, shortlisted_at)

- job_rounds (id, job_id, round_name, round_order, round_type: coding/mcq/interview/custom)

- job_round_results (id, application_id, round_id, result: pass/fail/hold, score, notes, updated_by, updated_at)

- custom_coding_questions (id, company_id, job_id nullable, title, description, function_signature jsonb, test_cases jsonb, language_support, is_sql boolean)

- mcq_master (id, concept_or_language, question, options, correct_answer)

- interview_sessions (id, application_id, round_id, meeting_link, scheduled_at, status)

- offers (id, application_id, offer_letter_link, status: sent/accepted/declined, sent_at, responded_at)

- joining_formalities (id, application_id, documents jsonb, bgv_status: pending/in_progress/cleared/flagged, bgv_agency_name, bgv_updated_at)

## Notifications needed

- Shortlisted for a job (Verified: in-app + email / External: email only, with a verify-to-proceed prompt)

- Round result updated (pass/fail/hold)

- Interview scheduled

- Offer sent

- Daily digest for any pending candidate action


## Why this fits the existing zero-cost build

- AI extraction step: a single LLM call per JD (cheap, infrequent — only runs when a JD is created/edited, not per candidate)

- Scoring itself: plain application logic, no external API, no ongoing cost

- Coding round: reuses the already-built Piston-based compiler from the Contest module

- SQL questions: sql.js runs entirely in the browser, free

- Interviews: Jitsi Meet free tier, no API key, no per-minute cost

- BGV: manual status field, no paid verification API

- External applicant forms: plain structured web forms, no third-party form service needed

- Revenue-generating pieces (relevancy packages) use the same Razorpay integration already built — no new payment provider needed

Feature spec for use with Claude Code — build alongside the existing Company Portal, Contest module, and Admin Portal.
