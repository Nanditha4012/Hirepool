import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendDailyDigests } from '../utils/dailyDigest';

/**
 * Internal endpoints called by infrastructure (Vercel Cron), never a
 * browser — see middleware/requireCronSecret.ts for the auth model, which
 * is deliberately not the JWT/RLS-session scheme every other endpoint in
 * this app uses.
 */
export const dailyDigestCron = asyncHandler(async (req: Request, res: Response) => {
  const result = await sendDailyDigests();
  res.json(result);
});
