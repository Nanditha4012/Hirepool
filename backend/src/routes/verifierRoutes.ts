import { Router } from 'express';
import * as verifierController from '../controllers/verifierController';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

const router = Router();

router.get('/ping', requireAuth, requireRole('verifier'), verifierController.ping);

export default router;
