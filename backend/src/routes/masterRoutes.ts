import { Router } from 'express';
import * as masterController from '../controllers/masterController';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';

const router = Router();

router.get('/roles', masterController.listRoles);
router.get('/platform-badges', masterController.listPlatformBadges);
router.get('/companies', masterController.listCompanies);
router.get('/skills', masterController.listSkills);
router.get('/domains', masterController.listDomains);
router.post(
  '/companies/request',
  requireAuth,
  requireRole('candidate'),
  masterController.requestCompany,
);

export default router;
