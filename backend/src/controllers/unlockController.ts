import { Request, Response } from 'express';
import { z } from 'zod';
import {
  CompanyProfile,
  Unlock,
  User,
  CandidateProfile,
  RoleMaster,
  CandidateSkill,
  SkillMaster,
  Notification,
} from '../models';
import type { CandidateProfileAttributes } from '../models/CandidateProfile';
import type { RoleMasterAttributes } from '../models/RoleMaster';
import type { CandidateSkillAttributes } from '../models/CandidateSkill';
import type { SkillMasterAttributes } from '../models/SkillMaster';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';
import { buildWhatsappLink } from '../utils/contact';
import {
  loadCompanyVisibleEducation,
  type CompanyVisibleEducation,
} from '../utils/companyVisibleProfile';

// ---------------------------------------------------------------------
// POST /unlock
// ---------------------------------------------------------------------

const unlockSchema = z.object({ candidateId: z.string().uuid() });

// Low-unlock-quota notification fires exactly once, the moment
// remainingUnlocks crosses DOWN to this value — not on every unlock spent
// while already at/below it. A coarse threshold-crossing check, not a
// "notify once per period" dedup mechanism (there's no reset-tracking
// infrastructure to key that off yet) — good enough at this scale per the
// Phase 6 spec.
const LOW_UNLOCK_QUOTA_THRESHOLD = 2;

export const unlockCandidate = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { candidateId } = unlockSchema.parse(req.body);

  const result = await runInRequestContext(authUser, async (t) => {
    // Sequential — shares transaction `t` (see candidateController's
    // buildProfileResponse comment for the full rationale).
    const company = await CompanyProfile.findOne({ where: { userId: authUser.id }, transaction: t });
    if (!company) {
      throw ApiError.notFound('Company profile not found');
    }
    if (!company.verified) {
      throw ApiError.forbidden('Your company must be verified before unlocking candidates');
    }

    const existing = await Unlock.findOne({
      where: { companyId: authUser.id, candidateId },
      transaction: t,
    });

    // Idempotent: an already-unlocked candidate is just returned again, no
    // charge against remainingUnlocks.
    if (existing) {
      const candidateUser = await User.findByPk(candidateId, { transaction: t });
      if (!candidateUser) {
        throw ApiError.notFound('Candidate not found');
      }
      return {
        unlock: existing,
        phone: candidateUser.phone,
        email: candidateUser.email,
        whatsappLink: buildWhatsappLink(candidateUser.phone),
      };
    }

    if (company.remainingUnlocks <= 0) {
      throw ApiError.paymentRequired(
        'No unlocks remaining on your current plan — upgrade to unlock more candidates',
      );
    }

    const candidateUser = await User.findByPk(candidateId, { transaction: t });
    if (!candidateUser || candidateUser.role !== 'candidate') {
      throw ApiError.notFound('Candidate not found');
    }

    const created = await Unlock.create({ companyId: authUser.id, candidateId }, { transaction: t });

    company.remainingUnlocks -= 1;
    await company.save({ transaction: t });

    // Fires exactly on the crossing, not on every unlock spent below it —
    // see LOW_UNLOCK_QUOTA_THRESHOLD's comment above.
    if (company.remainingUnlocks === LOW_UNLOCK_QUOTA_THRESHOLD) {
      await Notification.create(
        {
          userId: authUser.id,
          type: 'low_unlock_quota',
          message: `You're running low on unlocks — ${company.remainingUnlocks} remaining on your current plan.`,
          link: '/company/billing',
        },
        { transaction: t },
      );
    }

    return {
      unlock: created,
      phone: candidateUser.phone,
      email: candidateUser.email,
      whatsappLink: buildWhatsappLink(candidateUser.phone),
    };
  });

  res.status(201).json(result);
});

// ---------------------------------------------------------------------
// GET /me/unlocked
// ---------------------------------------------------------------------

/**
 * Held to the same name / role / skills / experience / education boundary as
 * search — see utils/companyVisibleProfile.ts.
 *
 * Paying to unlock buys the candidate's contact details, not a wider view of
 * their profile: the projects and platform links withheld before the unlock
 * are withheld after it too, because the reason for withholding them (they
 * are routes to reach the candidate off-platform, and they belong to third
 * parties as often as to the candidate) does not change once money has
 * changed hands. `platformBadges` and `verifiedAchievementCounts` used to be
 * on this interface and have been removed.
 */
interface UnlockedCandidateResponse {
  candidateId: string;
  fullName: string | null;
  primaryRole: { id: string; roleName: string } | null;
  category: string | null;
  yearsOfExperience: number | null;
  skills: { id: string; skillName: string }[];
  education: CompanyVisibleEducation[];
  note: string | null;
  unlockedAt: Date;
  phone: string | null;
  email: string | null;
  whatsappLink: string | null;
}

export const listMyUnlocked = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;

  const results = await runInRequestContext(authUser, async (t) => {
    const unlocks = await Unlock.findAll({
      where: { companyId: authUser.id },
      order: [['unlockedAt', 'DESC']],
      transaction: t,
    });

    const items: UnlockedCandidateResponse[] = [];
    for (const unlock of unlocks) {
      // Sequential per-unlock detail fetches — same reasoning as
      // candidateController.buildProfileResponse.
      const candidateUser = await User.findByPk(unlock.candidateId, { transaction: t });
      const profile = await CandidateProfile.findOne({
        where: { userId: unlock.candidateId },
        include: [{ model: RoleMaster, as: 'primaryRole' }],
        transaction: t,
      });
      const skillRows = await CandidateSkill.findAll({
        where: { candidateId: unlock.candidateId },
        include: [{ model: SkillMaster, as: 'skill' }],
        transaction: t,
      });
      const education = await loadCompanyVisibleEducation(unlock.candidateId, t);

      const plainProfile = profile
        ? (profile.get({ plain: true }) as CandidateProfileAttributes & {
            primaryRole: RoleMasterAttributes | null;
          })
        : null;

      items.push({
        candidateId: unlock.candidateId,
        fullName: candidateUser?.fullName ?? null,
        primaryRole: plainProfile?.primaryRole
          ? { id: plainProfile.primaryRole.id, roleName: plainProfile.primaryRole.roleName }
          : null,
        category: plainProfile?.category ?? null,
        yearsOfExperience: plainProfile?.yearsOfExperience ?? null,
        skills: skillRows.map((row) => {
          const plain = row.get({ plain: true }) as CandidateSkillAttributes & {
            skill: SkillMasterAttributes;
          };
          return { id: plain.skill.id, skillName: plain.skill.skillName };
        }),
        education,
        note: unlock.note,
        unlockedAt: unlock.unlockedAt,
        // Always shown here — being in this list means already unlocked.
        phone: candidateUser?.phone ?? null,
        email: candidateUser?.email ?? null,
        whatsappLink: buildWhatsappLink(candidateUser?.phone),
      });
    }

    return items;
  });

  res.json(results);
});

// ---------------------------------------------------------------------
// PATCH /me/unlocked/:candidateId/note
// ---------------------------------------------------------------------

const updateNoteSchema = z.object({ note: z.string() });

export const updateUnlockNote = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { candidateId } = req.params;
  const { note } = updateNoteSchema.parse(req.body);

  const unlock = await runInRequestContext(authUser, async (t) => {
    const existing = await Unlock.findOne({
      where: { companyId: authUser.id, candidateId },
      transaction: t,
    });
    if (!existing) {
      throw ApiError.notFound('Unlock not found');
    }

    existing.note = note;
    await existing.save({ transaction: t });
    return existing;
  });

  res.json(unlock);
});
