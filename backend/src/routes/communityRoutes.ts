import { Router } from 'express';
import * as feedController from '../controllers/feedController';
import { requireAuth } from '../middleware/requireAuth';
import { requireVerified } from '../middleware/requireVerified';

const router = Router();

// Same "any signed-in role, but only once verified" reasoning as
// feedRoutes.ts. Community posts are FeedPost rows too, so creating one goes
// through POST /feed/posts with `kind: 'community'` rather than being
// duplicated here — these routes cover the catalogue, membership and the
// per-community feeds.
const gate = [requireAuth, requireVerified] as const;

// The literal '/me/feed' is declared before '/:slug/...' so the param route
// cannot swallow it.
router.get('/me/feed', ...gate, feedController.listMyCommunityFeed);
router.get('/', ...gate, feedController.listCommunities);
router.get('/:slug/posts', ...gate, feedController.listCommunityPosts);
router.post('/:slug/join', ...gate, feedController.joinCommunity);
router.delete('/:slug/join', ...gate, feedController.leaveCommunity);

export default router;
