import { Router } from 'express';
import * as masterController from '../controllers/masterController';

const router = Router();

router.get('/roles', masterController.listRoles);
router.get('/platform-badges', masterController.listPlatformBadges);
router.get('/companies', masterController.listCompanies);

export default router;
