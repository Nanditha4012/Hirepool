import { Router } from 'express';
import * as candidateController from '../controllers/candidateController';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

const router = Router();

router.patch('/me/category', requireAuth, requireRole('candidate'), candidateController.setCategory);
router.get('/ping', requireAuth, requireRole('candidate'), candidateController.ping);

export default router;
