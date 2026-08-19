import { Router } from 'express';
import * as internalController from '../controllers/internalController';
import { requireCronSecret } from '../middleware/requireCronSecret';

// Infrastructure-only routes — no requireAuth/requireRole anywhere here,
// guarded instead by requireCronSecret. Mounted at /internal
// (routes/index.ts).
const router = Router();

router.get('/cron/daily-digest', requireCronSecret, internalController.dailyDigestCron);

export default router;
