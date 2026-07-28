import { Request, Response } from 'express';
import { z } from 'zod';
import { Notification } from '../models';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';

/**
 * Notification list/read endpoints for the currently authenticated user
 * (any role) — previously nonexistent: five controllers across the
 * codebase write Notification rows, but nothing let a user read them back.
 * Mounted at /api/me/notifications* behind requireAuth only (routes/meRoutes.ts).
 */

function parsePagination(page?: number, limit?: number): { page: number; limit: number } {
  const resolvedPage = page && page > 0 ? page : 1;
  const resolvedLimit = Math.min(limit && limit > 0 ? limit : 20, 50);
  return { page: resolvedPage, limit: resolvedLimit };
}

// ---------------------------------------------------------------------
// GET /me/notifications
// ---------------------------------------------------------------------

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional(),
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const listMyNotifications = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const query = listQuerySchema.parse(req.query);
  const { page, limit } = parsePagination(query.page, query.limit);

  const result = await runInRequestContext(authUser, async (t) => {
    const where: Record<string, unknown> = { userId: authUser.id };
    if (query.unreadOnly) where.readAt = null;

    const results = await Notification.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
      transaction: t,
    });
    const totalCount = await Notification.count({ where, transaction: t });

    return { results, page, limit, totalCount };
  });

  res.json(result);
});

// ---------------------------------------------------------------------
// GET /me/notifications/unread-count
// ---------------------------------------------------------------------

export const getUnreadCount = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;

  const count = await runInRequestContext(authUser, (t) =>
    Notification.count({ where: { userId: authUser.id, readAt: null }, transaction: t }),
  );

  res.json({ count });
});

// ---------------------------------------------------------------------
// PATCH /me/notifications/:id/read
// ---------------------------------------------------------------------

export const markNotificationRead = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { id } = req.params;

  const notification = await runInRequestContext(authUser, async (t) => {
    const existing = await Notification.findOne({
      where: { id, userId: authUser.id },
      transaction: t,
    });
    if (!existing) {
      throw ApiError.notFound('Notification not found');
    }

    // Idempotent — marking an already-read notification read again is not
    // an error, and must not clobber the original readAt timestamp.
    if (!existing.readAt) {
      existing.readAt = new Date();
      await existing.save({ transaction: t });
    }

    return existing;
  });

  res.json(notification);
});

// ---------------------------------------------------------------------
// PATCH /me/notifications/read-all
// ---------------------------------------------------------------------

export const markAllNotificationsRead = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;

  await runInRequestContext(authUser, (t) =>
    Notification.update(
      { readAt: new Date() },
      { where: { userId: authUser.id, readAt: null }, transaction: t },
    ),
  );

  res.status(204).send();
});
