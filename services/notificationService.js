import Notification from '../models/Notification.js';
import { io } from '../server.js';

class NotificationService {
  /**
   * Send a notification to a single user
   * @param {string} userId - The ID of the user to notify
   * @param {Object} notificationData - The notification data
   * @returns {Promise<Object>} The created notification
   */
  static async sendNotification(userId, notificationData) {
    const notification = await Notification.create({
      user: userId,
      ...notificationData
    });

    // Emit to the specific user's room
    io.to(`user_${userId}`).emit('notification', notification);
    
    return notification;
  }

  /**
   * Send a notification to multiple users
   * @param {Array<string>} userIds - Array of user IDs to notify
   * @param {Object} notificationData - The notification data
   * @returns {Promise<Array>} Array of created notifications
   */
  static async broadcastNotification(userIds, notificationData) {
    const notifications = await Notification.createForUsers(
      userIds,
      notificationData
    );

    // Emit to each user's room
    userIds.forEach(userId => {
      io.to(`user_${userId}`).emit('notification', {
        ...notificationData,
        user: { _id: userId }
      });
    });

    return notifications;
  }

  /**
   * Mark all notifications as read for a user
   * @param {string} userId - The ID of the user
   * @returns {Promise<Object>} The update result
   */
  static async markAllAsRead(userId) {
    const result = await Notification.markAllAsRead(userId);
    
    // Notify the user that notifications were marked as read
    io.to(`user_${userId}`).emit('notifications:read');
    
    return result;
  }

  /**
   * Mark a single notification as read
   * @param {string} notificationId - The ID of the notification
   * @param {string} userId - The ID of the user
   * @returns {Promise<Object>} The updated notification
   */
  static async markAsRead(notificationId, userId) {
    const notification = await Notification.findOne({
      _id: notificationId,
      user: userId
    });

    if (!notification) {
      throw new Error('Notification not found');
    }

    await notification.markAsRead();
    
    // Notify the user that a notification was marked as read
    io.to(`user_${userId}`).emit('notification:read', { _id: notificationId });
    
    return notification;
  }

  /**
   * Get all notifications for a user
   * @param {string} userId - The ID of the user
   * @param {Object} options - Query options (limit, skip, etc.)
   * @returns {Promise<Object>} The notifications and pagination info
   */
  static async getUserNotifications(userId, options = {}) {
    const limit = options.limit || 20;
    const page = options.page || 1;
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      Notification.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Notification.countDocuments({ user: userId })
    ]);

    return {
      notifications,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get unread notification count for a user
   * @param {string} userId - The ID of the user
   * @returns {Promise<number>} The count of unread notifications
   */
  static async getUnreadCount(userId) {
    return Notification.countDocuments({
      user: userId,
      read: false
    });
  }

  /**
   * Delete a notification
   * @param {string} notificationId - The ID of the notification
   * @param {string} userId - The ID of the user
   * @returns {Promise<Object>} The deleted notification
   */
  static async deleteNotification(notificationId, userId) {
    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      user: userId
    });

    if (!notification) {
      throw new Error('Notification not found');
    }

    // Notify the user that a notification was deleted
    io.to(`user_${userId}`).emit('notification:deleted', { _id: notificationId });
    
    return notification;
  }
}

export default NotificationService;
