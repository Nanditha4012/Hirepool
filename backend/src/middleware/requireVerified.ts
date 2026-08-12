import { NextFunction, Request, Response } from 'express';
import { CandidateProfile, CompanyProfile } from '../models';
import { ApiError } from '../utils/ApiError';
import { runInRequestContext } from '../utils/withRequestContext';

/**
 * The account-level gate: "has this account passed verification yet?"
 *
 * Must run after requireAuth — it relies on req.user being populated.
 *
 * requireRole answers *which* role may touch a route. This answers whether
 * that role's account is live yet, which is a different question and was
 * previously not asked anywhere: a candidate whose profile was sitting in the
 * verifier queue (or had just been rejected) could still read the Walk-in
 * Pedia, join communities and sit contests, and an unverified company could do
 * the same, because every one of those routes stopped at requireAuth. The
 * product rule is that until verification passes, an account can see exactly
 * one thing — what it submitted and where that submission stands.
 *
 * Verifiers and admins pass straight through: they have no profile to verify,
 * and they need read access to the shared surfaces to moderate them.
 *
 * The 403 body carries a machine-readable `code` so the frontend can tell
 * "you are not verified yet" apart from an ordinary permission failure and
 * route to the status page rather than showing a dead end.
 */
export function requireVerified(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const authUser = req.user;
  if (!authUser) {
    next(ApiError.unauthorized());
    return;
  }

  if (authUser.role === 'verifier' || authUser.role === 'admin') {
    next();
    return;
  }

  void (async () => {
    try {
      if (authUser.role === 'candidate') {
        const profile = await runInRequestContext(authUser, (t) =>
          CandidateProfile.findOne({ where: { userId: authUser.id }, transaction: t }),
        );

        if (!profile || profile.status !== 'approved') {
          next(
            ApiError.forbidden(
              'Your profile has not been verified yet. You can see your submission and its status until a verifier approves it.',
              'PROFILE_NOT_VERIFIED',
            ),
          );
          return;
        }
      } else if (authUser.role === 'company') {
        const profile = await runInRequestContext(authUser, (t) =>
          CompanyProfile.findOne({ where: { userId: authUser.id }, transaction: t }),
        );

        if (!profile || !profile.verified) {
          next(
            ApiError.forbidden(
              'Your company has not been verified yet. You can see your submitted details and their status until an admin approves them.',
              'COMPANY_NOT_VERIFIED',
            ),
          );
          return;
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  })();
}
