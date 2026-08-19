import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

/**
 * Guards the Vercel Cron endpoints (routes/internalRoutes.ts) — checks
 * `Authorization: Bearer <CRON_SECRET>`, the header Vercel automatically
 * attaches to cron-invoked requests once CRON_SECRET is set as a project
 * env var. Timing-safe comparison, same pattern as
 * utils/razorpay.ts's verifyWebhookSignature.
 *
 * Fails closed if CRON_SECRET isn't configured — see the comment on it in
 * config/env.ts for why that's the opposite default from every other
 * optional-external-service var in this app.
 */
export function requireCronSecret(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const provided = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';

  if (!env.CRON_SECRET || !provided) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const expected = Buffer.from(env.CRON_SECRET, 'utf8');
  const actual = Buffer.from(provided, 'utf8');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  next();
}
