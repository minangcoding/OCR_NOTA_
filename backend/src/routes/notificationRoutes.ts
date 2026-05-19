import { Router } from 'express';
import { getNotifications, markNotificationsAsRead } from '../controllers/NotificationController';
import { verifyToken, requireAdmin } from '../middlewares/auth';

const router = Router();

// Only admin can access notifications
router.use(verifyToken);
router.use(requireAdmin);

router.get('/', getNotifications);
router.put('/mark-read', markNotificationsAsRead);

export default router;
