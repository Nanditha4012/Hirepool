import { Request, Response } from 'express';
import { Job, JobRound, JobApplication, JobRoundResult, Offer } from '../models';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';

/**
 * End-to-End ATS (Feature 2) — Phase 11: analytics. Per the build plan:
 * "Read-only aggregation layer over job_applications/job_round_results/
 * offers/joining_formalities timestamps — no new tables needed." "Full
 * funnel with drop-off rate per stage split Verified vs External, average
 * score per round, average time-in-stage, time-to-hire." No migration in
 * this phase — everything here reads existing tables.
 *
 * "Persists forever, even on reopened jobs" (spec) needs no code of its
 * own: nothing in this app ever purges job_applications/job_round_results/
 * offers, so history is already permanent by construction.
 *
 * ── A necessary approximation, flagged rather than hidden ────────────────
 * "Average time-in-stage" implies a per-round entry timestamp, which
 * doesn't exist — job_applications.current_round_id is a pointer, not a
 * history, and no phase added a "candidate entered this round at time X"
 * column (doing so was out of scope for "no new tables needed"). The
 * closest available proxy, used here: for each round, the average time
 * from the application being shortlisted to that round's result being
 * decided (job_round_results.updated_at - job_applications.shortlisted_at).
 * That measures "time from shortlist to this round's decision," not the
 * time spent specifically inside that round — worth knowing before reading
 * too much into the numbers.
 */

interface FunnelStage {
  stage: string;
  roundId: string | null;
  totalCount: number;
  verifiedCount: number;
  externalCount: number;
  dropOffRate: number;
}

function splitBySource(applications: { source: 'internal' | 'external' }[]): { verified: number; external: number } {
  return {
    verified: applications.filter((a) => a.source === 'internal').length,
    external: applications.filter((a) => a.source === 'external').length,
  };
}

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
}

export const getJobAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const authUser = req.user!;
  const { jobId } = req.params;

  const response = await runInRequestContext(authUser, async (t) => {
    const job = await Job.findOne({ where: { id: jobId, companyId: authUser.id }, transaction: t });
    if (!job) throw ApiError.notFound('Job not found');

    const applications = await JobApplication.findAll({ where: { jobId }, transaction: t });
    const applicationIds = applications.map((a) => a.id);
    const applicationById = new Map(applications.map((a) => [a.id, a]));

    const rounds = await JobRound.findAll({ where: { jobId }, order: [['roundOrder', 'ASC']], transaction: t });
    const roundResults =
      applicationIds.length > 0
        ? await JobRoundResult.findAll({ where: { applicationId: applicationIds }, transaction: t })
        : [];
    const offers =
      applicationIds.length > 0 ? await Offer.findAll({ where: { applicationId: applicationIds }, transaction: t }) : [];

    // ----- Funnel -----
    const funnel: FunnelStage[] = [];

    const shortlistedSplit = splitBySource(applications);
    funnel.push({
      stage: 'Shortlisted',
      roundId: null,
      totalCount: applications.length,
      verifiedCount: shortlistedSplit.verified,
      externalCount: shortlistedSplit.external,
      dropOffRate: 0,
    });

    let previousStageCount = applications.length;
    for (const round of rounds) {
      const reachedApplicationIds = new Set(roundResults.filter((r) => r.roundId === round.id).map((r) => r.applicationId));
      const reached = [...reachedApplicationIds]
        .map((id) => applicationById.get(id))
        .filter((a): a is JobApplication => Boolean(a));
      const split = splitBySource(reached);
      funnel.push({
        stage: round.roundName,
        roundId: round.id,
        totalCount: reached.length,
        verifiedCount: split.verified,
        externalCount: split.external,
        dropOffRate: previousStageCount > 0 ? 1 - reached.length / previousStageCount : 0,
      });
      previousStageCount = reached.length;
    }

    const offeredApplicationIds = new Set(offers.map((o) => o.applicationId));
    const offered = [...offeredApplicationIds].map((id) => applicationById.get(id)).filter((a): a is JobApplication => Boolean(a));
    const offeredSplit = splitBySource(offered);
    funnel.push({
      stage: 'Offer',
      roundId: null,
      totalCount: offered.length,
      verifiedCount: offeredSplit.verified,
      externalCount: offeredSplit.external,
      dropOffRate: previousStageCount > 0 ? 1 - offered.length / previousStageCount : 0,
    });

    const joinedApplicationIds = new Set(offers.filter((o) => o.status === 'accepted').map((o) => o.applicationId));
    const joined = [...joinedApplicationIds].map((id) => applicationById.get(id)).filter((a): a is JobApplication => Boolean(a));
    const joinedSplit = splitBySource(joined);
    funnel.push({
      stage: 'Joined',
      roundId: null,
      totalCount: joined.length,
      verifiedCount: joinedSplit.verified,
      externalCount: joinedSplit.external,
      dropOffRate: offered.length > 0 ? 1 - joined.length / offered.length : 0,
    });

    // ----- Average score per round -----
    const averageScorePerRound = rounds.map((round) => {
      const scores = roundResults.filter((r) => r.roundId === round.id && r.score !== null).map((r) => r.score as number);
      const average = scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : null;
      return { roundId: round.id, roundName: round.roundName, averageScore: average };
    });

    // ----- Average time-in-stage (approximation — see header note) -----
    const averageTimeInStageDays = rounds.map((round) => {
      const days = roundResults
        .filter((r) => r.roundId === round.id)
        .map((r) => {
          const application = applicationById.get(r.applicationId);
          return application ? daysBetween(application.shortlistedAt, r.updatedAt) : null;
        })
        .filter((d): d is number => d !== null);
      const average = days.length > 0 ? days.reduce((sum, d) => sum + d, 0) / days.length : null;
      return { roundId: round.id, roundName: round.roundName, averageDays: average };
    });

    // ----- Time-to-hire -----
    const hireDurations = offers
      .filter((o) => o.status === 'accepted' && o.respondedAt)
      .map((o) => {
        const application = applicationById.get(o.applicationId);
        return application ? daysBetween(application.shortlistedAt, o.respondedAt as Date) : null;
      })
      .filter((d): d is number => d !== null);
    const timeToHireDays = hireDurations.length > 0 ? hireDurations.reduce((sum, d) => sum + d, 0) / hireDurations.length : null;

    return { jobId: job.id, funnel, averageScorePerRound, averageTimeInStageDays, timeToHireDays };
  });

  res.json(response);
});
