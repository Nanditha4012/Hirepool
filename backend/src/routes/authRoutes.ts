import { Router } from 'express';
import * as authController from '../controllers/authController';
import { requireAuth } from '../middleware/requireAuth';
import { signupLimiter, loginLimiter, forgotPasswordLimiter, otpVerifyLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/signup', signupLimiter, authController.signup);
router.post('/login', loginLimiter, authController.login);
router.post('/totp/enroll', authController.totpEnroll);
router.post('/totp/verify', authController.totpVerify);
router.post('/google', loginLimiter, authController.googleAuth);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);
router.post('/forgot-password', forgotPasswordLimiter, authController.forgotPassword);
router.post('/reset-password/verify-otp', otpVerifyLimiter, authController.verifyResetOtp);
router.post('/reset-password', authController.resetPassword);

export default router;
