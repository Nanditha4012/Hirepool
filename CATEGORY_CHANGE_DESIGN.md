# Design question: candidate category change (Fresher → Experienced → Executive)

## The scenario

A candidate signs up and is categorized as **Fresher**. Their profile builder shows Fresher-only
fields (coding platform badges, 3+ project links, etc.), they get verified, and their profile goes
live.

A year passes. They now have real work experience and want their profile to reflect
**Experienced** (or later, **Executive**) instead.

Today, `category` is chosen once at signup (`CategoryPage.tsx` → `candidate_profiles.category`)
and there is no flow to change it afterward. This doc lays out how that should work.

## Why this isn't trivial

- Fresher and Experienced/Executive have **different mandatory fields**. Switching category means
  new required fields (years of experience, current/last company, designation, offer
  letter/LinkedIn) that were never collected.
- The verifier's **Track 1 checklist is category-specific** (Fresher: confirm project links are
  live + GitHub history. Experienced/Executive: cross-check LinkedIn against claimed
  company/title/years, verify the offer letter). A category change means the profile needs
  re-verification against a *different* checklist, not just a relabeling.
- The candidate's profile might already be **live and getting attention from companies**. Whatever
  happens during the transition shouldn't needlessly take that away.

## Recommended approach

1. **Category change is a deliberate action**, not an inline field edit — a "Change category"
   button with a confirmation explaining what's required next (new mandatory fields, re-verification).
2. **Nothing gets deleted.** Fresher-specific data (platform badges, project links) stays — it's
   still valid proof of ability and continues to show as supplementary info. The Achievements &
   Work module is already category-independent, so it's unaffected either way.
3. **Reuse the existing `pendingReverification` / `reverificationRequestedAt` columns**
   (`candidate_profiles`, already added by the verifier-workflow migration) instead of resetting
   `status` back to `draft`/`submitted`. Changing category sets these flags; the candidate's
   **current approved profile stays exactly as-is and stays live/searchable** while they fill in
   the new category's required fields.
4. Once submitted, it goes into the verifier queue under the **new** category's Track 1 checklist.
   Only on approval does the profile actually start reflecting the new category to companies —
   until then, companies keep seeing the old (still-true) data, never a half-finished new version.

This mirrors the philosophy already built into the app: an unverified badge or achievement never
takes down an otherwise-good profile. A category upgrade shouldn't either.

### Alternative (simpler, not recommended)

Treat a category change like a full profile reset: immediately flip `status` to
`draft`/`submitted`, profile disappears from search until fully re-approved under the new
category. Easier to build, but the candidate goes dark the moment they try to update their own
profile — a real cost for someone who was already getting interest, and it contradicts the
"never block a good profile" pattern used everywhere else in this app.

## Two open decisions

### 1. Should downgrades be allowed?

E.g. Experienced → Fresher. This doesn't reflect real career progression.

- **Option A — Upgrades only (recommended).** Fresher → Experienced → Executive allowed freely.
  Downgrading is blocked outright; a genuine edge case would need to go through admin/support.
  Reasoning: allowing free downgrades opens a path where a *rejected* Experienced profile gets
  resubmitted as Fresher specifically to dodge the original rejection reason.
- **Option B — Allow any change, just re-verify.** Simpler rule, no special-casing by direction,
  but doesn't close the rejection-dodging path above.

### 2. What do companies see while a category-change re-verification is pending?

- **Option A — Old approved data stays fully visible (recommended).** Profile keeps showing under
  the OLD category with the OLD data until the new category's fields are verified. Candidate never
  goes dark. Matches how badges/achievements already behave.
- **Option B — Hide the profile until re-verified.** Simpler to reason about, but the candidate
  disappears from search the instant they start the update.

---
Let me know which options you want for the two open decisions (or a different combination) and I'll implement it.
