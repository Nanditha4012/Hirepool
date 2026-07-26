## Hirepool

(working name — final name to be decided)

## Reverse Job Board — Full Architecture & Build Spec

## Zero-cost stack · Web only · All 7 build phases, for use with Claude Code

A reverse job board: candidates build verified profiles, companies browse and unlock contact info — instead of companies posting jobs and candidates applying blindly. Build phase by phase, in order. Confirm each phase works before starting the next.

## Zero-cost constraint (applies throughout)

No paid third-party services until the platform is earning. This build avoids: phone/SMS OTP verification (drops the Twilio dependency entirely), the WhatsApp Business Cloud API and any paid WhatsApp provider (Interakt/AiSensy/Gupshup) — the WhatsApp icon on a candidate's profile is a plain wa.me deep link that opens the candidate's own WhatsApp chat, which costs nothing and needs no API key. Every other service used (Supabase, Vercel, GitHub, reCAPTCHA, Resend) has a free tier sufficient for early-stage traffic. Razorpay is the one exception — it's free to integrate and only takes a cut of actual transactions, so it costs nothing until money is actually changing hands.

## Data consistency rule (applies throughout)

Any field with a known, finite set of valid values must be a dropdown/select/searchable-combobox populated from a master table — never a manual text input. This applies to coding platform badges/ranks, company name, designation/title, roles, skills, and domain. Free text stays only for fields that are inherently open-ended and unique per candidate (achievement titles/descriptions, research paper titles, project descriptions).

## Design system (use throughout every phase)

- Primary: deep blue #0A66C2 (buttons, links, headers)

- Background: white #FFFFFF + light gray #F3F4F6

- Text: dark slate #1F2937

- Verified badge: green #16A34A

- Highlight/Boost: amber #F59E0B

- Reject/danger: red #DC2626

- Clean sans-serif (Inter or similar), 12px rounded card corners, soft shadows, generous white space — corporate and trustworthy, like LinkedIn/Naukri/Indeed, not playful.


## Phase 1 — Foundation, Design System & Auth

Build a web app (browser-based only, no native mobile app) for the reverse job board concept above.

## App name — keep changeable

Final product name isn't decided yet. Do not hardcode any name into components, page titles, manifest.json, or email templates. Store it as a single config value (e.g. APP_NAME in an env variable or a site_settings table read at build/runtime) and reference that everywhere text or branding appears — logo text, page <title>, manifest name/short_name, email footer. "Hirepool" is used as a placeholder throughout this spec; swapping the config value later should be the only change needed to rebrand.

## Responsiveness

Mobile-first web design (not a native app). Every screen must work on mobile browser (single column), tablet (2-column where relevant), and desktop (full layout with sidebar filters). Use Tailwind responsive breakpoints (sm/md/lg) throughout. Build as a PWA — manifest.json + service worker for installability and an offline shell — this gives an app-like feel on phones without building or maintaining a separate native app.

## Roles / Auth

Four roles: candidate, company, verifier, admin. Auth is email + password plus Google OAuth only — no phone/SMS OTP verification anywhere in the app (avoids any Twilio/SMS cost). Verifier and admin accounts require 2FA via TOTP (Google Authenticator-style, generated and verified with a free library like otplib — no external API or cost). After signup, candidates choose a category: Fresher, Experienced, or Executive — this determines which profile fields they fill in later.

## Database (Postgres / Supabase free tier, RLS enabled from the start)

- users (id, role, email, phone [self-entered, unverified], created_at)

- candidate_profiles (linked to users, category, status: draft/submitted/under_review/approved/rejected/needs_info)

- company_profiles (linked to users, company name, domain, verified boolean)

- verification_logs (reviewer, decision, timestamp, notes)

- admin_audit_logs (admin_id, action, target, timestamp)

- roles_master (id, role_name) — pre-seeded with 100+ role names (searchable dropdown, see Phase 2)

- platform_badges_master (id, platform_name, badge_name, sort_order) — pre-seeded per coding platform with its real, finite badge/rank set, e.g. LeetCode: Knight, Guardian; Codeforces: Newbie through Grandmaster; CodeChef: 1★-7★; GeeksforGeeks: institute rank bands. Used to populate a dropdown per platform — never free text.

- companies_master (id, company_name, is_mnc, is_faang_maang) — searchable list of known companies, used for both candidate's "current/last company" field and company signup's own name. Admin can add new companies on request; candidates cannot free-type one.

- messages (id, company_id, candidate_id, sender_role, body, created_at, read_at) — powers in-app messaging between companies and candidates.

- notifications (id, user_id, type, message, link, created_at, read_at) — in-app notification center, used instead of paid SMS/WhatsApp push alerts (see Phase 6).

- candidate_platform_badges (id, candidate_id, platform_name, badge_selected, platform_profile_link, verification_status: pending/verified/rejected, rejection_reason) — one row per coding platform a candidate adds. Verified independently of the main profile (see Phase 4).

- candidate_achievements (id, candidate_id, type: project/research/achievement, title, description, links, certificate_or_proof_link, verification_status: pending/verified/rejected, rejection_reason, created_at) —


powers the post-approval Achievements & Work module (see Phase 2), verified independently of the main profile (see Phase 4).

Enforce RLS: candidates read/write only their own row; companies read only approved candidate profiles with contact fields excluded unless a valid unlock exists; verifiers read/write verification tables and candidate status; admins have full access.

## Landing page

Hero section — "Companies find you. Not the other way around." A 3-step how-it-works (Register & get verified Show up on the platform Companies unlock your contact). Separate CTAs: "I'm looking for a job" (candidate signup) vs "I'm hiring" (company signup).


## Phase 2 — Candidate Portal (Profile Builder)

## Category-aware form

Show fields specific to Fresher / Experienced / Executive.

## Fresher fields (mandatory)

- Full name, email (verified via signup confirmation link), phone number (self-entered, no OTP verification)

- Coding platform links: for each platform added (LeetCode, Codeforces, GeeksforGeeks, HackerRank, CodeChef, etc.), the candidate must provide their public platform profile link (mandatory) — this is what a verifier opens to confirm the claimed badge is real.

- The candidate selects their badge/rank from a dropdown populated from platform_badges_master for that specific platform — no free-text entry. Each platform's badge starts as Pending in candidate_platform_badges and is not shown on the public profile card until a verifier confirms it against the profile link. If marked Incorrect, the badge stays hidden, the candidate sees the reason in their Inbox/notifications, and can correct the badge selection or profile link and resubmit just that platform — this does not block or reopen the rest of the profile (see Phase 4).

- Total questions solved per platform is stored as a numeric field only — it does NOT generate any platform-assigned tier or badge. Exists purely so companies can filter/sort by solved-count later. No 100+/150+/300+ tier system.

- 3–5+ live deployed project links with matching GitHub repo links for each

- Optional portfolio link

- Primary role — searchable dropdown (combobox with type-ahead) pulling from roles_master, pre-seeded with 100+ software/tech roles

- Optional secondary roles — same searchable combobox, added as removable chips

- Skills — multi-select chips

- One domain of interest (Fintech, Healthtech, E-commerce, EdTech, etc.)

- Public Google Drive resume link

## Experienced fields

Same as Fresher minus coding platforms, plus: years of experience (numeric), current/last company — searchable dropdown from companies_master, not free text (missing company triggers an "add company" request routed to Admin for approval), designation — searchable dropdown reusing the roles_master combobox, offer/experience letter upload OR LinkedIn URL, company type (MNC / Startup / Agency — dropdown, auto-suggested from companies_master flags, editable only by verifier if it conflicts) — verified internally before any badge is granted.

## Executive fields

Same as Experienced, plus leadership scope: team size managed, budget owned (optional), title/level.

## Submission flow

Save as draft anytime. On submit, status "Under Review". Status tracker: Draft Submitted Under Review Approved / Rejected (reason shown) / Needs More Info. Rejected/needs-info candidates can edit and resubmit.

## Post-approval dashboard

- View own profile card exactly as companies see it

- Toggle "Actively looking" / "Not looking" — pauses visibility without deleting the profile

- Read-only log of which companies unlocked their contact


- Inbox — candidates see and reply to direct messages sent by companies. No subscription or restriction on the candidate side — full free access always.

- Edit profile — triggers re-verification only for changed fields

- "Boost my profile" — pay to feature the card at the top of search results with an amber highlighted border for a chosen number of days

## Post-approval "Achievements" module

Editable any time after approval, no need to redo full verification. A dedicated dashboard section, Achievements & Work, with three sub-types the candidate can add, each as its own card:

- 1 Projects — title, description, tech stack (chips), live deployed link, GitHub repo link, optional cover image (candidates can keep adding beyond the mandatory 3–5 required at signup)

- 2 Research papers — title, publication/conference/journal name, publication link (DOI or public link), co-authors (optional), date, certificate/proof link (mandatory)

- 3 Achievements / Wins — title (e.g. "Winner, Smart India Hackathon 2026"), description, date, certificate/proof link (mandatory) — e.g. a certificate PDF/image link, official results page, or news mention

Each new entry is stored in candidate_achievements with status Pending and goes into a lightweight review queue, separate from full profile verification (see Phase 4). An entry is not shown anywhere on the public profile — card or expanded view — until a verifier marks it Verified against its certificate/proof link. If marked Incorrect, it stays hidden, the candidate sees the reason in their Inbox/notifications, and can edit and resubmit that one entry without affecting the rest of the profile, which remains live throughout. Verified entries show as an expandable section on the full profile detail view; the compact card shows a small summary chip counting only verified items (e.g. "3 projects · 1 paper · 2 wins") that expands on click.

## Profile card component (reused everywhere)

Rounded rectangle card. Top row: platform chips with logos — Portfolio, GitHub, LinkedIn, LeetCode, Codeforces, etc. Only platforms with a verification_status of Verified show their badge/rank next to the logo — a platform still Pending or marked Incorrect shows just the plain logo/link with no badge, so nothing unverified is ever displayed as fact. Each chip is tappable to open the link. First text line: Primary role + experience (e.g. "Backend Developer · 2+ yrs"). Below: secondary role chips. Below: skill chips. Below: domain chip. Below: resume link. Below: Achievements & Work summary chip that expands on click. Top-right corner: green verified checkmark if approved, plus MNC/Startup/FAANG-MAANG tags if applicable. Bottom row (visible to companies only after unlock): phone icon (tel: link), email icon (mailto: link), and a WhatsApp icon that is purely a wa.me/[number] deep link — opens the candidate's own WhatsApp app/web with a pre-filled chat. No WhatsApp API, no cost, just a redirect URL.


## Phase 3 — Company Portal

## Company signup

Company email (domain-based) preferred over free personal email. Collect company name, logo, website, industry, size, optional GST/registration number. New accounts start unverified — can browse with blurred contact info but can't unlock until basic verification passes.

## Search & browse

Grid of candidate cards (same component from Phase 2). Filter bar with:

- Tier: Fresher / Experienced / Executive

- Coding platform filters: filter by platform, by native badge/rank on that platform (Verified badges only — Pending/Incorrect ones are excluded from filter results since they aren't shown on any card), and by questions-solved range (numeric min/max slider) — replaces any platform-assigned tier system

- Experience years slider (Experienced/Executive)

- Skills multi-select, domain, role (searchable combobox), location, notice period

- "Verified only" toggle

- Unique filters as toggle chips: "MNC Alumni", "Startup Experience", "FAANG/MAANG Alumni"

- Filter by achievements: "Has published research", "Has hackathon win" (optional)

Sort: Relevance, Most recently approved, Boosted/Featured first (amber border in grid).

## Unlock flow

"Unlock Contact" button deducts one credit, reveals phone (tel: link), email (mailto: link), and the WhatsApp deep link. Unlocked candidates saved permanently to "My Unlocked Candidates," even after quota resets.

## In-app messaging

Every company account — including Free plan — can send direct messages to candidates through the platform, no separate purchase required. Distinct from "unlock": messaging doesn't require an unlock first, so companies can reach out before committing a credit. Messages appear in the candidate's Inbox; replies come back into the company's own thread. This is fully in-app (stored in the messages table) — no external messaging API involved.

- Free plan: capped number of distinct candidates messaged per month (e.g. 5) — enough to try, not enough to replace a subscription

- Paid plans: higher or unlimited monthly messaging caps, scaled with plan — same tiering pattern as unlock quotas

- Don't hard-block Free-plan messaging entirely — let them use it in a limited way, then prompt an upgrade at the cap, so the feature sells the subscription rather than gating it outright

- Thread view per candidate, timestamps, read receipts visible to the company once opened

- Anti-spam: rate-limit new-conversation starts per company per day even on unlimited plans; candidates can block/report a company from their Inbox (visible in Admin's fraud dashboard)

## Subscription plans

| Plan | Includes |
| --- | --- |
| Free | Browse only + capped monthly messaging, no unlocks |
| Starter | Fixed monthly unlocks + basic filters + higher messaging cap |
| Growth | More unlocks + all filters incl. MNC/FAANG tags + priority visibility + higher messaging cap |


| Pay-per-unlock | One-off unlock purchase, standard messaging cap |
| --- | --- |
| Enterprise/Agency | Custom pricing, bulk unlocks, CSV export, team seats, unlimited messaging |

## Company dashboard

Unlocks used vs quota, renewal date, invoice history, saved/unlocked candidates with private notes, team seat management for Enterprise.


## Phase 4 — Verification Portal (internal, role = verifier, route /verify)

## Review queue

All "Submitted" profiles, oldest-first, split into Fresher / Experienced / Executive tabs. Assignable to specific reviewers if team > 1.

## Two independent review tracks — important design rule

Profile-level verification (does the candidate go live at all) is decoupled from badge/achievement item-level verification (does this specific claim get shown). A wrong coding platform badge or an unverifiable achievement should never block or delay the rest of an otherwise-good profile from going live.

## Track 1 — Profile-level checklist (determines Approve/Reject/Needs-Info for the whole profile)

- Fresher: confirm each mandatory project link is live; confirm GitHub shows real commit history; confirm resume link opens. (Coding platform badges are NOT part of this checklist — see Track 2.)

- Experienced/Executive: cross-check LinkedIn against claimed company/title/years; verify offer/experience letter looks authentic; confirm company-type tag matches actual employer

Decision actions for this track: Approve (profile goes live immediately with a green verified checkmark) / Reject (mandatory reason dropdown + optional note) / Request More Info (field-specific feedback) / Flag as Suspicious (escalates to Admin, doesn't silently reject). A profile can be Approved and live even while its coding badges and achievements are still Pending in Track 2 — those items simply stay hidden from the public card until cleared separately.

## Track 2 — Badge & Achievement queue (separate tab, ongoing, does not gate profile approval)

A lightweight queue covering every candidate_platform_badges row and every candidate_achievements entry, regardless of whether the candidate's main profile is already Approved and live.

- Coding platform badges: verifier opens the candidate's platform profile link, confirms the selected badge/rank is accurate, marks it Verified or Incorrect (with a reason). Verified badges immediately appear on the public card; Incorrect ones stay hidden and the candidate is notified to fix the badge selection or link.

- Projects / Research papers / Achievements: verifier opens the certificate/proof link, marks the entry Verified or Incorrect (with a reason). Verified entries immediately appear in the expandable Achievements section on the public profile; Incorrect ones stay hidden and the candidate is notified to fix and resubmit just that entry.

- No entry in this track can ever block, reverse, or delay the Track 1 profile approval — it only controls whether that specific badge or achievement is visible.

## Analytics tab

Average time-to-approve, backlog size per queue, rejection-reason breakdown (last 30 days).


## Phase 5 — Admin Portal (route /admin, Super Admin + limited Admin levels)

## User (candidate) management

Searchable table, manual tier/badge override, suspend/ban/delete, impersonate-as-candidate (logged), bulk export/announcement.

## Company management

Approve/reject flagged signups, edit subscriptions directly, grant bonus unlocks, suspend/ban, view unlock history per company.

## Verification team management

Add/remove verifiers, reassign queue items, override decisions, per-verifier performance table.

## Financial control

Combined transaction ledger (subscriptions, unlocks, boosts), manual refunds/credits, editable pricing for every plan and boost fee (stored in DB, not hardcoded), revenue dashboards (MRR, churn, plan breakdown, boost vs subscription revenue).

## Content & configuration control

- App name / branding — edit the single APP_NAME config value and logo, so rebranding later doesn't require a code change

- Roles master list — add/remove/edit the 100+ roles used across Candidate and Company portals (also reused for the "designation" field)

- Platform badges master — add/remove/edit the fixed badge/rank list per coding platform

- Companies master — approve/reject candidate-submitted "add company" requests, edit MNC/FAANG-MAANG flags, merge duplicates

- Skills list, domain list management

- Badge definitions and icons (Verified, Featured, MNC Alumni, Startup, FAANG/MAANG Alumni)

- Homepage text and FAQ content

- Broadcast tool (in-app announcement banner or email blast) to segments

## Platform analytics

Candidate funnel (signup submitted approved boosted), company funnel (signup free browsing paid churn), most-searched skills/domains/roles report, fraud/abuse dashboard (flagged profiles, repeated rejections, suspicious unlock spikes, candidate-reported/blocked companies from the messaging module).

## Security controls

Full audit log of every admin action, force-logout any account, view active sessions.


## Phase 6 — Payments & Notifications

## Payments (Razorpay)

Three flows — company subscriptions (recurring monthly), company pay-per-unlock (one-time), candidate profile boost (one-time). Use webhooks to auto-upgrade/downgrade access and unlock credits/boost status on payment success/failure. Store all transactions in a payments table, surfaced in both the Admin financial ledger and the paying user's own invoice history. Razorpay is free to integrate; it only takes a transaction fee when a real payment happens, so this adds no upfront cost.

## In-app notifications (replaces paid SMS/WhatsApp alerts)

Use the notifications table from Phase 1 to power a simple in-app notification bell/center for: candidate profile status changes (submitted/approved/rejected/needs-info), low unlock quota alerts for companies, subscription renewal reminders, and new-message alerts when a company sends a candidate a direct message. This is fully free — no external push/SMS/WhatsApp service required. The WhatsApp icon on a candidate's profile stays purely a wa.me redirect link, not a notification channel.

## Email notifications

Signup confirmation, profile status changes, payment receipts, renewal reminders — use a free-tier transactional email provider (e.g. Resend or Postmark, both have free tiers covering low-volume early-stage sending).

Use Razorpay's hosted checkout rather than custom payment forms for PCI-compliance simplicity.


## Phase 7 — PWA, Responsive Polish & Security Hardening

## PWA

Confirm manifest.json (name from APP_NAME config, theme color #0A66C2, install icons) and a service worker with an offline shell. This is what gives the app-like mobile experience — no native app build/App Store/Play Store needed.

## Responsive QA

Walk every screen (landing, candidate, company, verification, admin) at mobile (<640px), tablet (640–1024px), desktop (>1024px). Fix overflow, broken grids, unreadable text at each breakpoint.

## Security hardening

- Confirm RLS policies match Phase 1 spec exactly (candidates own-row-only; companies see approved profiles minus contact unless unlocked; verifiers scoped to verification tables; admins full access)

- Rate-limit signup and search endpoints (via Supabase Edge Functions or Vercel middleware — no external service needed)

- CAPTCHA on candidate and company signup (Google reCAPTCHA free tier)

- Enforce 2FA (TOTP) for verifier/admin logins

- Duplicate-account detection (same email/resume link across accounts) — block obvious duplicates at signup

## Legal pages

Privacy Policy (explain that contact info is shared with paying companies after unlock), Terms of Service, consent checkbox at candidate signup.

## Deploy check

Confirm the app is pushed to the connected GitHub repo and deploying cleanly on Vercel's free tier, with Supabase/Razorpay/reCAPTCHA/email API keys set as environment variables — never hardcoded.


## Summary of Key Design Decisions

- Zero-cost build: no phone/SMS OTP (drops Twilio), no WhatsApp Business API or paid WhatsApp provider (the WhatsApp icon is just a free wa.me deep link), no native mobile app (PWA instead). Every other service used has a free tier; Razorpay only costs money once real payments are flowing.

- Removed any platform-assigned coding tier system (100+/150+/300+ badges). Candidates select their own platform badge/rank from a dropdown per coding platform (no free text), and total questions solved is a search filter only, not a displayed badge.

- Added a post-approval Achievements & Work module: candidates can keep adding Projects, Research Papers, and Achievements/Wins after approval.

- Decoupled item-level verification from profile-level approval: coding platform badges require a mandatory platform profile link, and Research Papers/Achievements require a mandatory certificate or proof link. Each is verified independently in its own queue. Nothing unverified (Pending or Incorrect) is ever shown on the public profile — but a wrong badge or unverifiable achievement never blocks or delays the rest of an otherwise-good profile from being Approved and going live. Candidates get notified and can correct just the flagged item, which then goes back through its own lightweight re-check.

- Roles use a 100+ role master list with a searchable/type-ahead combobox everywhere a role is selected or filtered (candidate signup, designation field, company search filters, admin management).

- No manual/free-text entry anywhere a fixed list exists — coding platform badges, company name, and designation are all dropdown/combobox selections backed by master tables, so data stays consistent and filterable. Only inherently unique fields (achievement/project/paper titles and descriptions) remain free text.

- App name is a config value, not hardcoded — final branding is undecided; "Hirepool" is used as a placeholder everywhere, but the build reads the name from one config source so it can be renamed later without touching component code.

- Added in-app messaging: companies can directly message candidates without needing to unlock first. Every plan including Free gets a capped number of monthly messages, with higher/unlimited caps on paid plans, so the feature itself drives upgrades rather than blocking access outright. Candidates always have full, unrestricted access to read and reply in their Inbox.

- Notifications are in-app (a notifications table + bell/center UI) plus free-tier email, replacing any paid SMS/WhatsApp push alert system.

Build reference for use with Claude Code — work phase by phase, verifying each against the companion deliverables checklist before moving on.
