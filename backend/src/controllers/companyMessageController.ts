import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';
import { Message, User, CompanyBlock, CompanyProfile, PlanMaster } from '../models';
import type { CompanyProfileAttributes } from '../models/CompanyProfile';
import type { PlanMasterAttributes } from '../models/PlanMaster';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';

// A small constant, independent of plan, on top of the plan's monthly new-
// conversation cap — see startOrReplyThread below.
const DAILY_NEW_THREAD_LIMIT = 20;

// ---------------------------------------------------------------------
// GET /me/messages
// ---------------------------------------------------------------------

export const listMyThreads = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;

  const threads = await runInRequestContext(authUser, async (t) => {
    const messages = await Message.findAll({
      where: { companyId: authUser.id },
      order: [['createdAt', 'ASC']],
      transaction: t,
    });

    const candidateIds = [...new Set(messages.map((m) => m.candidateId))];

    const candidateUsers = await User.findAll({
      where: { id: { [Op.in]: candidateIds } },
      transaction: t,
    });
    const candidateNameById = new Map(candidateUsers.map((u) => [u.id, u.fullName]));

    const messagesByCandidate = new Map<string, Message[]>();
    for (const message of messages) {
      const bucket = messagesByCandidate.get(message.candidateId) ?? [];
      bucket.push(message);
      messagesByCandidate.set(message.candidateId, bucket);
    }

    return candidateIds.map((candidateId) => ({
      candidateId,
      candidateName: candidateNameById.get(candidateId) ?? null,
      messages: messagesByCandidate.get(candidateId) ?? [],
    }));
  });

  res.json(threads);
});

// ---------------------------------------------------------------------
// POST /me/messages/:candidateId
// ---------------------------------------------------------------------

const messageBodySchema = z.object({ body: z.string().min(1) });

export const startOrReplyThread = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { candidateId } = req.params;
  const { body } = messageBodySchema.parse(req.body);

  const message = await runInRequestContext(authUser, async (t) => {
    // Sequential — shares transaction `t` (see candidateController's
    // buildProfileResponse comment for the full rationale).
    const block = await CompanyBlock.findOne({
      where: { companyId: authUser.id, candidateId },
      transaction: t,
    });
    if (block) {
      throw ApiError.forbidden('This candidate has blocked messages from your company');
    }

    const existingMessage = await Message.findOne({
      where: { companyId: authUser.id, candidateId },
      transaction: t,
    });
    const isNewConversation = !existingMessage;

    const company = await CompanyProfile.findOne({
      where: { userId: authUser.id },
      include: [{ model: PlanMaster, as: 'plan' }],
      transaction: t,
    });
    if (!company) {
      throw ApiError.notFound('Company profile not found');
    }

    // Replies to an existing thread are always allowed regardless of plan
    // cap / rate limit — only NEW conversations are gated.
    if (isNewConversation) {
      const plainCompany = company.get({ plain: true }) as CompanyProfileAttributes & {
        plan: PlanMasterAttributes | null;
      };
      const monthlyMessageCap = plainCompany.plan?.monthlyMessageCap ?? null;

      if (monthlyMessageCap !== null && company.messagesSentThisPeriod >= monthlyMessageCap) {
        throw ApiError.conflict(
          "You've reached your plan's monthly new-conversation limit — upgrade your plan to message more candidates",
        );
      }

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      // Simple daily rate limit on NEW conversation starts, independent of
      // plan. Determined by loading this company's full sent-message
      // history and finding, per candidate, the timestamp of the first
      // message ever sent to them — then counting how many of those
      // "first messages" fall today. Acceptable at this data scale (a
      // single company's outbound message volume); revisit with a
      // GROUP BY / window-function query if that stops being true.
      const allCompanyMessages = await Message.findAll({
        where: { companyId: authUser.id, senderRole: 'company' },
        order: [['createdAt', 'ASC']],
        transaction: t,
      });
      const firstMessageAtByCandidate = new Map<string, Date>();
      for (const m of allCompanyMessages) {
        if (!firstMessageAtByCandidate.has(m.candidateId)) {
          firstMessageAtByCandidate.set(m.candidateId, m.createdAt);
        }
      }
      const newThreadsStartedToday = [...firstMessageAtByCandidate.values()].filter(
        (d) => d >= startOfToday,
      ).length;

      if (newThreadsStartedToday >= DAILY_NEW_THREAD_LIMIT) {
        throw ApiError.conflict(
          `You can only start ${DAILY_NEW_THREAD_LIMIT} new candidate conversations per day`,
        );
      }
    }

    const created = await Message.create(
      { companyId: authUser.id, candidateId, senderRole: 'company', body },
      { transaction: t },
    );

    // Only increment on a genuinely new conversation, never on a reply.
    if (isNewConversation) {
      company.messagesSentThisPeriod += 1;
      await company.save({ transaction: t });
    }

    return created;
  });

  res.status(201).json(message);
});
