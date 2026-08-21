import { Router } from 'express';
import * as companyController from '../controllers/companyController';
import * as unlockController from '../controllers/unlockController';
import * as companyMessageController from '../controllers/companyMessageController';
import * as paymentController from '../controllers/paymentController';
import * as contestController from '../controllers/contestController';
import * as jdController from '../controllers/jdController';
import * as relevancyController from '../controllers/relevancyController';
import * as jobApplicationController from '../controllers/jobApplicationController';
import * as jobRoundController from '../controllers/jobRoundController';
import * as interviewController from '../controllers/interviewController';
import * as offerController from '../controllers/offerController';
import * as jobAnalyticsController from '../controllers/jobAnalyticsController';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';
import { requireVerified } from '../middleware/requireVerified';
import { searchLimiter } from '../middleware/rateLimiter';

const router = Router();

// Two tiers, deliberately.
//
// `companyOnly` is "signed in as a company": the account's own record and its
// billing trail. An unverified company must still be able to read back what it
// submitted and where that stands — that screen IS its whole app until an
// admin approves it — and it must be able to edit and resubmit.
//
// `verifiedCompany` is everything that touches *candidates*: search, contest
// performance, unlocks and messaging. searchCandidates already threw its own
// 403 for an unverified company; the rest did not, so an unverified account
// could still unlock a contact it had bought unlocks for, read and send
// messages, and pull a named candidate's contest history. The gate is now
// declared once per route instead of re-derived inside three controllers.
const companyOnly = [requireAuth, requireRole('company')] as const;
const verifiedCompany = [...companyOnly, requireVerified] as const;

router.get('/ping', ...companyOnly, companyController.ping);

// Profile
router.get('/me/profile', ...companyOnly, companyController.getMyCompanyProfile);
router.put('/me/profile', ...companyOnly, companyController.upsertMyCompanyProfile);

// Search / browse candidates
router.get('/search', ...verifiedCompany, searchLimiter, companyController.searchCandidates);

// Contest performance for one candidate. Deliberately NOT behind an unlock —
// it's Hirepool's own scored data, treated like the Achievements section
// rather than like contact details.
router.get(
  '/candidates/:candidateId/contest-performance',
  ...verifiedCompany,
  contestController.getCandidateContestPerformance,
);

// Unlock-contact flow
router.post('/unlock', ...verifiedCompany, unlockController.unlockCandidate);
router.get('/me/unlocked', ...verifiedCompany, unlockController.listMyUnlocked);
router.patch(
  '/me/unlocked/:candidateId/note',
  ...verifiedCompany,
  unlockController.updateUnlockNote,
);

// Messaging. The literal '/read' sub-resource is declared before the bare
// ':candidateId' POST target for the ordering discipline used throughout this
// codebase, even though the two differ by method.
router.get('/me/messages', ...verifiedCompany, companyMessageController.listMyThreads);
router.patch(
  '/me/messages/:candidateId/read',
  ...verifiedCompany,
  companyMessageController.markThreadRead,
);
router.post(
  '/me/messages/:candidateId',
  ...verifiedCompany,
  companyMessageController.startOrReplyThread,
);

// AI Relevancy Packages (Feature 1) — job creation + Groq JD parsing.
// companyOnly, not verifiedCompany: an unverified company can still draft a
// job the same way it can edit its own profile pre-verification; scoring
// against candidates (Phase 2) is where verification will actually matter.
router.post('/jobs', ...companyOnly, jdController.createJob);
router.get('/jobs', ...companyOnly, jdController.listMyJobs);
router.get('/jobs/:jobId', ...companyOnly, jdController.getJob);
router.put('/jobs/:jobId', ...companyOnly, jdController.updateJob);
// Feature 2, Phase 5 — careers page link + lifecycle.
router.post('/jobs/:jobId/careers-link', ...companyOnly, jdController.generateCareersLink);
router.post('/jobs/:jobId/close', ...companyOnly, jdController.closeJob);
router.post('/jobs/:jobId/reopen', ...companyOnly, jdController.reopenJob);

// Applications, badges, shortlisting (Phase 7) — verifiedCompany, same gate
// as search/unlock/batches: this touches candidate data, not just the
// company's own job draft.
router.post('/jobs/:jobId/applications', ...verifiedCompany, jobApplicationController.shortlistCandidates);
router.get('/jobs/:jobId/applications', ...verifiedCompany, jobApplicationController.listJobApplications);
router.patch(
  '/jobs/:jobId/applications/:applicationId',
  ...verifiedCompany,
  jobApplicationController.updateJobApplication,
);

// Coding & MCQ rounds (Phase 8).
router.post('/jobs/:jobId/rounds/default-template', ...companyOnly, jobRoundController.seedDefaultRounds);
router.get('/jobs/:jobId/rounds', ...companyOnly, jobRoundController.listRounds);
router.post('/jobs/:jobId/rounds', ...companyOnly, jobRoundController.createRound);
router.patch('/jobs/:jobId/rounds/:roundId', ...companyOnly, jobRoundController.updateRound);
router.delete('/jobs/:jobId/rounds/:roundId', ...companyOnly, jobRoundController.deleteRound);

router.get('/jobs/:jobId/rounds/:roundId/questions', ...companyOnly, jobRoundController.listRoundQuestions);
router.post('/jobs/:jobId/rounds/:roundId/questions', ...companyOnly, jobRoundController.attachQuestion);
router.delete(
  '/jobs/:jobId/rounds/:roundId/questions/:linkId',
  ...companyOnly,
  jobRoundController.detachQuestion,
);

router.get('/jobs/:jobId/rounds/:roundId/results', ...verifiedCompany, jobRoundController.listRoundResults);
router.patch(
  '/jobs/:jobId/rounds/:roundId/results/:applicationId',
  ...verifiedCompany,
  jobRoundController.decideRound,
);

// Coding question bank (company-owned, optionally job-scoped).
router.get('/coding-questions', ...companyOnly, jobRoundController.listCodingQuestions);
router.post('/coding-questions', ...companyOnly, jobRoundController.createCodingQuestion);
router.patch('/coding-questions/:id', ...companyOnly, jobRoundController.updateCodingQuestion);
router.delete('/coding-questions/:id', ...companyOnly, jobRoundController.deleteCodingQuestion);

// MCQ bank (company-owned, optionally job-scoped) — the public bank is
// admin-managed, see adminRoutes.ts.
router.get('/mcqs', ...companyOnly, jobRoundController.listMyMcqs);
router.post('/mcqs', ...companyOnly, jobRoundController.createMcq);
router.delete('/mcqs/:id', ...companyOnly, jobRoundController.deleteMcq);

// Interview round (Phase 9).
router.post(
  '/jobs/:jobId/rounds/:roundId/applications/:applicationId/interview',
  ...companyOnly,
  interviewController.scheduleInterview,
);
router.get(
  '/jobs/:jobId/rounds/:roundId/applications/:applicationId/interview',
  ...companyOnly,
  interviewController.getInterview,
);

// Offer & joining (Phase 10).
router.post('/jobs/:jobId/applications/:applicationId/offer', ...companyOnly, offerController.sendOffer);
router.get('/jobs/:jobId/applications/:applicationId/offer', ...companyOnly, offerController.getOffer);
router.get(
  '/jobs/:jobId/applications/:applicationId/joining',
  ...companyOnly,
  offerController.getJoiningFormalities,
);
router.patch(
  '/jobs/:jobId/applications/:applicationId/joining/bgv',
  ...companyOnly,
  offerController.updateBgvStatus,
);

// Analytics (Phase 11).
router.get('/jobs/:jobId/analytics', ...verifiedCompany, jobAnalyticsController.getJobAnalytics);

// Batch cards + browse-batch (Phase 2). verifiedCompany, not companyOnly —
// this is "browse candidates using the normal unlock flow", same gate as
// /search and the unlock endpoints above.
router.get('/jobs/:jobId/batches', ...verifiedCompany, relevancyController.getJobBatches);
router.get(
  '/jobs/:jobId/batches/:tier/candidates',
  ...verifiedCompany,
  relevancyController.listBatchCandidates,
);
// Package purchase (Phase 3) + download (Phase 3, controller below).
router.post(
  '/jobs/:jobId/batches/:tier/purchase',
  ...verifiedCompany,
  paymentController.purchaseRelevancyPackage,
);
router.get(
  '/relevancy-packages/:packageId/download',
  ...verifiedCompany,
  relevancyController.downloadPackage,
);
router.get('/jobs/:jobId/relevancy-packages', ...verifiedCompany, relevancyController.listJobPackages);

// Payments (Phase 6)
router.post('/payments/subscribe', requireAuth, requireRole('company'), paymentController.subscribe);
router.post(
  '/payments/unlock-topup',
  requireAuth,
  requireRole('company'),
  paymentController.unlockTopup,
);
router.get('/payments/history', requireAuth, requireRole('company'), paymentController.listMyPayments);

export default router;
