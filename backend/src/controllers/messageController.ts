import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';
import { Message, CompanyProfile, CompanyBlock, User, Notification } from '../models';
import { asyncHandler } from '../utils/asyncHandler';
import { runInRequestContext } from '../utils/withRequestContext';
import { companyDisplayName } from '../utils/displayName';

export const listMyThreads = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;

  const threads = await runInRequestContext(authUser, async (t) => {
    const messages = await Message.findAll({
      where: { candidateId: authUser.id },
      order: [['createdAt', 'ASC']],
      transaction: t,
    });

    const companyIds = [...new Set(messages.map((m) => m.companyId))];

    const companyProfiles = await CompanyProfile.findAll({
      where: { userId: { [Op.in]: companyIds } },
      transaction: t,
    });
    // The company's account email, needed to derive a readable name when
    // company_name is still the signup placeholder — see companyDisplayName.
    const companyUsers = await User.findAll({
      where: { id: { [Op.in]: companyIds } },
      transaction: t,
    });
    const emailByUserId = new Map(companyUsers.map((u) => [u.id, u.email]));
    const profileByUserId = new Map(companyProfiles.map((c) => [c.userId, c]));

    // Which of these companies this candidate has already blocked. Previously
    // the frontend only knew about blocks it had made in the current page
    // session, so reloading the inbox showed a working reply box for a
    // company the candidate had blocked days earlier.
    const blocks = await CompanyBlock.findAll({
      where: { candidateId: authUser.id, companyId: { [Op.in]: companyIds } },
      transaction: t,
    });
    const blockedCompanyIds = new Set(blocks.map((b) => b.companyId));

    const messagesByCompany = new Map<string, Message[]>();
    for (const message of messages) {
      const bucket = messagesByCompany.get(message.companyId) ?? [];
      bucket.push(message);
      messagesByCompany.set(message.companyId, bucket);
    }

    return companyIds
      .map((companyId) => {
        const profile = profileByUserId.get(companyId);
        const threadMessages = messagesByCompany.get(companyId) ?? [];
        const lastMessage = threadMessages[threadMessages.length - 1];

        return {
          companyId,
          companyName: companyDisplayName(profile?.companyName, emailByUserId.get(companyId)),
          logoLink: profile?.logoLink ?? null,
          industry: profile?.industry ?? null,
          verified: profile?.verified ?? false,
          blocked: blockedCompanyIds.has(companyId),
          // Lets the inbox show an unread count and sort by recency without
          // every client re-deriving both from the message array.
          unreadCount: threadMessages.filter((m) => m.senderRole === 'company' && !m.readAt).length,
          lastMessageAt: lastMessage?.createdAt ?? null,
          messages: threadMessages,
        };
      })
      // Most recently active first — the order every messaging app uses, and
      // the one that makes an inbox usable past about five threads.
      .sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0));
  });

  res.json(threads);
});

/**
 * PATCH /me/messages/:companyId/read — marks the company's messages on this
 * thread as read.
 *
 * Split from listMyThreads rather than marking on read: opening the inbox is
 * not the same as opening a conversation, and a GET that mutates makes the
 * unread count depend on whether something happened to refetch.
 */
export const markThreadRead = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { companyId } = req.params;

  const updatedCount = await runInRequestContext(authUser, async (t) => {
    const [count] = await Message.update(
      { readAt: new Date() },
      {
        where: {
          candidateId: authUser.id,
          companyId,
          senderRole: 'company',
          readAt: null,
        },
        transaction: t,
      },
    );
    return count;
  });

  res.json({ updated: updatedCount });
});

const replySchema = z.object({
  body: z.string().min(1),
});

export const replyToThread = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { companyId } = req.params;
  const { body } = replySchema.parse(req.body);

  const message = await runInRequestContext(authUser, async (t) => {
    const created = await Message.create(
      {
        companyId,
        candidateId: authUser.id,
        senderRole: 'candidate',
        body,
      },
      { transaction: t },
    );

    // Notify the recipient (the company on this thread) — same
    // Notification.create shape verifierController.ts already uses.
    await Notification.create(
      {
        userId: companyId,
        type: 'new_message',
        message: `You have a new message from a candidate.`,
        link: '/company/messages',
      },
      { transaction: t },
    );

    return created;
  });

  res.status(201).json(message);
});
