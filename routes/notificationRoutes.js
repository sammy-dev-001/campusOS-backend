import express from 'express';
import {
  clearAllNotifications,
  deleteNotification,
  getMyNotifications,
  getNotificationPreferences,
  getUnreadCount,
  markAllAsRead,
  markAsRead,
  registerPushToken,
  removePushToken,
  testPushNotification,
  updateNotificationPreferences
} from '../controllers/notificationController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Protect all routes after this middleware
router.use(protect);

// Push token management
router.post('/register-push-token', registerPushToken);
router.delete('/push-token', removePushToken);

// Notification preferences
router.get('/preferences', getNotificationPreferences);
router.put('/preferences', updateNotificationPreferences);

// Test notification (for debugging)
router.post('/test', testPushNotification);

// Get all notifications for the current user
router.get('/', getMyNotifications);

// Get unread notification count
router.get('/unread-count', getUnreadCount);

// Mark a notification as read
router.patch('/:id/read', markAsRead);

// Mark all notifications as read
router.patch('/mark-all-read', markAllAsRead);

// Delete a notification
router.delete('/:id', deleteNotification);

// Clear all notifications
router.delete('/', clearAllNotifications);

export default router;

