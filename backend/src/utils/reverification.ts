import { Transaction } from 'sequelize';
import { CandidateProfile } from '../models';

/**
 * Flags an already-live candidate's profile as having unverified changes.
 *
 * Called whenever a candidate adds or edits a project, research entry,
 * achievement or platform badge. Two things matter here:
 *
 *  - It only fires for `approved` profiles. A candidate still in draft or
 *    under review is going through the normal submit flow, where every item
 *    is looked at anyway; flagging them would be noise.
 *
 *  - It does NOT change `status`. The profile stays approved and visible to
 *    companies — pulling a live candidate off the portal because they added
 *    a fourth project would punish them for keeping it current. Only the new
 *    item is unverified (its own `verificationStatus` is 'pending', which is
 *    what puts it in the verifier's item queues).
 *
 * `reverificationRequestedAt` is reset to null so a change made *after* a
 * request forces the candidate to ask again — otherwise they could request
 * once and then keep appending unreviewed work under that stale request.
 */
export async function markProfileNeedsReverification(
  candidateUserId: string,
  t: Transaction,
): Promise<void> {
  const profile = await CandidateProfile.findOne({
    where: { userId: candidateUserId },
    transaction: t,
  });

  if (!profile || profile.status !== 'approved') {
    return;
  }

  profile.pendingReverification = true;
  profile.reverificationRequestedAt = null;
  await profile.save({ transaction: t });
}
