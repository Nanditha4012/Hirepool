import { Router } from 'express';
import authRoutes from './authRoutes';
import candidateRoutes from './candidateRoutes';
import companyRoutes from './companyRoutes';
import verifierRoutes from './verifierRoutes';
import adminRoutes from './adminRoutes';
import masterRoutes from './masterRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/candidates', candidateRoutes);
router.use('/companies', companyRoutes);
router.use('/verify', verifierRoutes);
router.use('/admin', adminRoutes);
router.use('/masters', masterRoutes);

export default router;
