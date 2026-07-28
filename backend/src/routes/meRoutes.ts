import { Router } from 'express';
import * as notificationController from '../controllers/notificationController';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

// Generic "any authenticated user" routes — not role-gated, unlike every
// other route file, since notifications belong to a user regardless of
// role (candidate/company/verifier/admin all receive them).
router.get('/notifications', requireAuth, notificationController.listMyNotifications);
router.get('/notifications/unread-count', requireAuth, notificationController.getUnreadCount);
router.patch('/notifications/read-all', requireAuth, notificationController.markAllNotificationsRead);
router.patch('/notifications/:id/read', requireAuth, notificationController.markNotificationRead);

export default router;
