import { Router } from 'express';
import authRoutes from './authRoutes';
import candidateRoutes from './candidateRoutes';
import companyRoutes from './companyRoutes';
import verifierRoutes from './verifierRoutes';
import adminRoutes from './adminRoutes';
import masterRoutes from './masterRoutes';
import meRoutes from './meRoutes';
import paymentRoutes from './paymentRoutes';
import contestRoutes from './contestRoutes';
import feedRoutes from './feedRoutes';
import communityRoutes from './communityRoutes';
import careersRoutes from './careersRoutes';
import internalRoutes from './internalRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/candidates', candidateRoutes);
router.use('/companies', companyRoutes);
router.use('/verify', verifierRoutes);
router.use('/admin', adminRoutes);
router.use('/masters', masterRoutes);
router.use('/contests', contestRoutes);
// Walk-in Pedia / Job Book / Communities. Mounted at the top level rather
// than under a role prefix because every signed-in role shares them — see
// the note in feedRoutes.ts.
router.use('/feed', feedRoutes);
router.use('/communities', communityRoutes);
router.use('/me', meRoutes);
// Phase 6: only the public Razorpay webhook lives here — the authenticated
// checkout/history endpoints are mounted under /companies and /candidates
// instead (see companyRoutes.ts / candidateRoutes.ts), matching how every
// other role-scoped feature in this codebase is organized.
router.use('/payments', paymentRoutes);
// Public Careers Page (Feature 2, Phase 5) — genuinely anonymous, no auth
// middleware anywhere under this prefix.
router.use('/careers', careersRoutes);
// Infrastructure-only (Vercel Cron) — see requireCronSecret, not the
// JWT/RLS scheme every other route uses.
router.use('/internal', internalRoutes);

export default router;
