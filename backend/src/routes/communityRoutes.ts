import { Router } from 'express';
import * as feedController from '../controllers/feedController';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

// Same "any signed-in role" reasoning as feedRoutes.ts. Community posts are
// FeedPost rows too, so creating one goes through POST /feed/posts with
// `kind: 'community'` rather than being duplicated here — these routes cover
// the catalogue, membership and the per-community feeds.

// The literal '/me/feed' is declared before '/:slug/...' so the param route
// cannot swallow it.
router.get('/me/feed', requireAuth, feedController.listMyCommunityFeed);
router.get('/', requireAuth, feedController.listCommunities);
router.get('/:slug/posts', requireAuth, feedController.listCommunityPosts);
router.post('/:slug/join', requireAuth, feedController.joinCommunity);
router.delete('/:slug/join', requireAuth, feedController.leaveCommunity);

export default router;
