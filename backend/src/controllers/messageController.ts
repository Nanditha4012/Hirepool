import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';
import { Message, CompanyProfile, Notification } from '../models';
import { asyncHandler } from '../utils/asyncHandler';
import { runInRequestContext } from '../utils/withRequestContext';

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
    const companyNameById = new Map(companyProfiles.map((c) => [c.userId, c.companyName]));

    const messagesByCompany = new Map<string, Message[]>();
    for (const message of messages) {
      const bucket = messagesByCompany.get(message.companyId) ?? [];
      bucket.push(message);
      messagesByCompany.set(message.companyId, bucket);
    }

    return companyIds.map((companyId) => ({
      companyId,
      companyName: companyNameById.get(companyId) ?? null,
      messages: messagesByCompany.get(companyId) ?? [],
    }));
  });

  res.json(threads);
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
