import { Router } from 'express';
import * as adminController from '../controllers/adminController';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

const router = Router();

router.get('/ping', requireAuth, requireRole('admin'), adminController.ping);

export default router;
