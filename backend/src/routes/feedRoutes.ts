import { Router } from 'express';
import * as feedController from '../controllers/feedController';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

// requireAuth only, no requireRole — unlike every other route file here.
// Walk-in Pedia and the Job Book are a shared noticeboard by design: a
// candidate reads and posts drives, a company posts its own vacancies and
// watches what is being said about it, and both sides use the same
// like/discuss/report controls. Gating either surface by role would break the
// feature rather than protect it. Who may edit or delete a given row is
// decided per row (author or admin) in the controller and in RLS.

// Literal '/walkins/locations' precedes nothing that could swallow it, but is
// declared before the list anyway — the ordering discipline used throughout
// this codebase.
router.get('/walkins/locations', requireAuth, feedController.listWalkinLocations);
router.get('/walkins', requireAuth, feedController.listWalkins);
router.get('/jobs', requireAuth, feedController.listJobs);

router.post('/posts', requireAuth, feedController.createPost);
// '/posts/:id/...' sub-resources are declared before the bare '/posts/:id' so
// the param route cannot swallow them.
router.post('/posts/:id/like', requireAuth, feedController.toggleLike);
router.post('/posts/:id/report', requireAuth, feedController.toggleReport);
router.get('/posts/:id/comments', requireAuth, feedController.listComments);
router.post('/posts/:id/comments', requireAuth, feedController.addComment);
router.delete('/comments/:commentId', requireAuth, feedController.deleteComment);
router.get('/posts/:id', requireAuth, feedController.getPost);
router.delete('/posts/:id', requireAuth, feedController.deletePost);

export default router;
