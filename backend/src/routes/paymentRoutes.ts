import { Router } from 'express';
import * as paymentController from '../controllers/paymentController';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

// Public — Razorpay calls this directly, there is no logged-in user and
// this deliberately does NOT go through requireAuth. The handler
// independently verifies the Razorpay HMAC signature (see
// utils/razorpay.ts's verifyWebhookSignature) before touching the DB; see
// migrations/20240107000001-phase6-payments-notifications.js's
// payments_update_for_webhook policy for the matching RLS side of this.
router.post('/razorpay/webhook', paymentController.razorpayWebhook);

// Manual UPI payment path — any authenticated role can own a manual
// payment row (company subscribe/upi, candidate boost/upi), so this is
// role-agnostic unlike the role-scoped routes in companyRoutes/
// candidateRoutes. Ownership is enforced in the controller + by
// payments_owner_update_manual_upi's RLS, not by role.
router.patch('/upi/:paymentId/submit', requireAuth, paymentController.submitUpiReference);

export default router;
