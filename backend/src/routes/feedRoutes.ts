import { Router } from 'express';
import * as feedController from '../controllers/feedController';
import { requireAuth } from '../middleware/requireAuth';
import { requireVerified } from '../middleware/requireVerified';

const router = Router();

// requireAuth + requireVerified, no requireRole — unlike every other route
// file here.
//
// Walk-in Pedia and the Job Book are a shared noticeboard by design: a
// candidate reads and posts drives, a company posts its own vacancies and
// watches what is being said about it, and both sides use the same
// like/discuss/report controls. Gating either surface by *role* would break
// the feature rather than protect it. Who may edit or delete a given row is
// decided per row (author or admin) in the controller and in RLS.
//
// Verification is the orthogonal gate, and it does apply: an account still in
// (or rejected by) review has no business reading the board or posting to it,
// so requireVerified sits on every route below. Verifiers and admins pass
// through it untouched — they moderate this board.
const gate = [requireAuth, requireVerified] as const;

// Literal '/walkins/locations' precedes nothing that could swallow it, but is
// declared before the list anyway — the ordering discipline used throughout
// this codebase.
router.get('/walkins/locations', ...gate, feedController.listWalkinLocations);
router.get('/walkins', ...gate, feedController.listWalkins);
router.get('/jobs', ...gate, feedController.listJobs);

router.post('/posts', ...gate, feedController.createPost);
// '/posts/:id/...' sub-resources are declared before the bare '/posts/:id' so
// the param route cannot swallow them.
router.post('/posts/:id/like', ...gate, feedController.toggleLike);
router.post('/posts/:id/report', ...gate, feedController.toggleReport);
router.get('/posts/:id/comments', ...gate, feedController.listComments);
router.post('/posts/:id/comments', ...gate, feedController.addComment);
// '/comments/:commentId/like' before the bare '/comments/:commentId' for the
// ordering discipline used throughout this codebase.
router.post('/comments/:commentId/like', ...gate, feedController.toggleCommentLike);
router.delete('/comments/:commentId', ...gate, feedController.deleteComment);
router.get('/posts/:id', ...gate, feedController.getPost);
router.delete('/posts/:id', ...gate, feedController.deletePost);

export default router;
