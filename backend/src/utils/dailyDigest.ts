import { Op } from 'sequelize';
import { JobApplication, Notification, User } from '../models';
import { runInRequestContext } from '../utils/withRequestContext';
import { sendEmail } from './email';
import { dailyDigestEmail } from './emailTemplates';

/**
 * End-to-End ATS (Feature 2, Phase 7) — the one genuinely time-based
 * notification in this spec ("a daily digest notification reminds
 * candidates... of any pending action rather than spamming on every
 * micro-update"). Everything else in this app is read- or webhook-
 * triggered; this is the first real scheduled job, invoked by Vercel Cron
 * hitting GET /internal/cron/daily-digest once a day (see
 * routes/internalRoutes.ts, backend/vercel.json's `crons` entry).
 *
 * "Pending action" is scoped narrowly for now: a candidate with at least
 * one job_applications row still in `shortlisted` status. Later phases
 * (rounds/interview/offer) will have more to say here — this function is
 * the single place that grows, the cron plumbing around it does not need
 * to change.
 *
 * Dedup: a candidate already digested within the last 20 hours is skipped
 * — same dedup-window pattern companyController.maybeSendRenewalReminder
 * already uses, so a slightly-early or slightly-late cron tick can't double
 * -send.
 */

const DIGEST_DEDUP_MS = 20 * 60 * 60 * 1000;
const MAX_CANDIDATES_PER_RUN = 1000;

export interface DailyDigestResult {
  notified: number;
  eligible: number;
  capped: boolean;
}

export async function sendDailyDigests(): Promise<DailyDigestResult> {
  const { candidateIds, eligible } = await runInRequestContext(null, async (t) => {
    const rows = await JobApplication.findAll({
      where: { status: 'shortlisted', candidateId: { [Op.ne]: null } },
      attributes: ['candidateId'],
      group: ['candidateId'],
      transaction: t,
    });
    const allIds = rows.map((r) => r.candidateId as string);
    return { candidateIds: allIds.slice(0, MAX_CANDIDATES_PER_RUN), eligible: allIds.length };
  });

  let notified = 0;
  for (const candidateId of candidateIds) {
    // Own transaction per candidate — a failure partway through one
    // candidate's digest must not roll back or block every other
    // candidate's, unlike the tightly-scoped transactions elsewhere in
    // this app where one logical operation genuinely is one unit.
    const task = await runInRequestContext(null, async (t) => {
      const recentDigest = await Notification.findOne({
        where: {
          userId: candidateId,
          type: 'daily_digest',
          createdAt: { [Op.gte]: new Date(Date.now() - DIGEST_DEDUP_MS) },
        },
        transaction: t,
      });
      if (recentDigest) return null;

      const pendingCount = await JobApplication.count({
        where: { candidateId, status: 'shortlisted' },
        transaction: t,
      });
      if (pendingCount === 0) return null;

      const user = await User.findByPk(candidateId, { transaction: t });
      if (!user) return null;

      await Notification.create(
        {
          userId: candidateId,
          type: 'daily_digest',
          message: `You have ${pendingCount} pending item${pendingCount === 1 ? '' : 's'}.`,
          link: '/candidate/applications',
        },
        { transaction: t },
      );

      return { email: user.email, fullName: user.fullName, pendingCount };
    });

    if (task) {
      const { subject, html } = dailyDigestEmail(task.fullName ?? task.email, task.pendingCount);
      await sendEmail({ to: task.email, subject, html });
      notified += 1;
    }
  }

  return { notified, eligible, capped: eligible > MAX_CANDIDATES_PER_RUN };
}
