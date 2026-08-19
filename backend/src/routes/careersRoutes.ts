import { Router } from 'express';
import * as careersController from '../controllers/careersController';
import { careersLimiter, careersApplyLimiter } from '../middleware/rateLimiter';

// Public Careers Page (Feature 2, Phase 5). No requireAuth anywhere in this
// file — an external applicant has never logged in. Mounted at the top
// level as /careers (routes/index.ts), same pattern as /feed and
// /communities being mounted outside any role prefix.
const router = Router();

router.get('/:slug', careersLimiter, careersController.getJobBySlug);
router.post('/:slug/apply', careersApplyLimiter, careersController.applyToJob);

export default router;
