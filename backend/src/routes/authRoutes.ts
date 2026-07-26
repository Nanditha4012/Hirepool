import { Router } from 'express';
import * as authController from '../controllers/authController';
import { requireAuth } from '../middleware/requireAuth';
import { signupLimiter, loginLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/signup', signupLimiter, authController.signup);
router.post('/login', loginLimiter, authController.login);
router.post('/totp/enroll', authController.totpEnroll);
router.post('/totp/verify', authController.totpVerify);
router.post('/google', loginLimiter, authController.googleAuth);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);

export default router;
