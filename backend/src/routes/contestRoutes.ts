import { Router } from 'express';
import * as contestController from '../controllers/contestController';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';
import { requireVerified } from '../middleware/requireVerified';

const router = Router();

// Same per-route convention as candidateRoutes/adminRoutes rather than a
// blanket router.use().
//
// requireVerified as well as requireRole: a contest score is published on the
// candidate's profile as proof of ability, so it can only be earned by an
// account that has actually passed verification. Without this an unapproved
// (or rejected) candidate could still sit tests and bank results against a
// profile no company will ever see.
const candidateOnly = [requireAuth, requireRole('candidate'), requireVerified] as const;

// ----- Hub & listing -----
router.get('/hub', ...candidateOnly, contestController.getHub);
// '/leaderboard' and '/hub' are declared before any ':contestId' route so a
// param route can never swallow the literal paths — the ordering discipline
// used throughout this codebase.
router.get('/leaderboard', ...candidateOnly, contestController.getLeaderboard);
router.get('/me/performance', ...candidateOnly, contestController.getMyContestPerformance);
router.get('/', ...candidateOnly, contestController.listContests);

// ----- Attempts -----
// Literal '/attempts/...' segments precede '/:contestId/...' for the same
// reason.
router.put(
  '/attempts/:attemptId/responses/:questionId',
  ...candidateOnly,
  contestController.saveResponse,
);
router.post('/attempts/:attemptId/run', ...candidateOnly, contestController.runCode);
router.post('/attempts/:attemptId/submit-code', ...candidateOnly, contestController.submitCode);
router.post('/attempts/:attemptId/submit', ...candidateOnly, contestController.submitAttempt);
router.get('/attempts/:attemptId/result', ...candidateOnly, contestController.getAttemptResult);
// Declared after '/result' so the literal segment wins over ':attemptId'.
router.get('/attempts/:attemptId', ...candidateOnly, contestController.resumeAttempt);

router.post('/:contestId/attempts', ...candidateOnly, contestController.startAttempt);

export default router;
