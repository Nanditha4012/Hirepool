import { Router } from 'express';
import authRoutes from './authRoutes';
import candidateRoutes from './candidateRoutes';
import companyRoutes from './companyRoutes';
import verifierRoutes from './verifierRoutes';
import adminRoutes from './adminRoutes';
import masterRoutes from './masterRoutes';
import meRoutes from './meRoutes';
import paymentRoutes from './paymentRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/candidates', candidateRoutes);
router.use('/companies', companyRoutes);
router.use('/verify', verifierRoutes);
router.use('/admin', adminRoutes);
router.use('/masters', masterRoutes);
router.use('/me', meRoutes);
// Phase 6: only the public Razorpay webhook lives here — the authenticated
// checkout/history endpoints are mounted under /companies and /candidates
// instead (see companyRoutes.ts / candidateRoutes.ts), matching how every
// other role-scoped feature in this codebase is organized.
router.use('/payments', paymentRoutes);

export default router;
