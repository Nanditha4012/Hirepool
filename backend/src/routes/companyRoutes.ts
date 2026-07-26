import { Router } from 'express';
import * as companyController from '../controllers/companyController';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

const router = Router();

router.get('/ping', requireAuth, requireRole('company'), companyController.ping);

export default router;
