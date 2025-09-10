import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications
} from '../controllers/notificationController.js';

const router = express.Router();

// Protect all routes after this middleware
router.use(protect);

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
