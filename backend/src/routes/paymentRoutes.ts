import { Router } from 'express';
import * as paymentController from '../controllers/paymentController';

const router = Router();

// Public — Razorpay calls this directly, there is no logged-in user and
// this deliberately does NOT go through requireAuth. The handler
// independently verifies the Razorpay HMAC signature (see
// utils/razorpay.ts's verifyWebhookSignature) before touching the DB; see
// migrations/20240107000001-phase6-payments-notifications.js's
// payments_update_for_webhook policy for the matching RLS side of this.
router.post('/razorpay/webhook', paymentController.razorpayWebhook);

export default router;
