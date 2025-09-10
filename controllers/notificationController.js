import NotificationService from '../services/notificationService.js';
import AppError from '../utils/appError.js';

/**
 * @desc    Get all notifications for the current user
 * @route   GET /api/notifications
 * @access  Private
 */
export const getMyNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { notifications, pagination } = await NotificationService.getUserNotifications(
      req.user.id,
      { page: parseInt(page), limit: parseInt(limit) }
    );

    res.status(200).json({
      status: 'success',
      data: {
        notifications,
        pagination
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get unread notification count for the current user
 * @route   GET /api/notifications/unread-count
 * @access  Private
 */
export const getUnreadCount = async (req, res, next) => {
  try {
    const count = await NotificationService.getUnreadCount(req.user.id);
    
    res.status(200).json({
      status: 'success',
      data: {
        count
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Mark a notification as read
 * @route   PATCH /api/notifications/:id/read
 * @access  Private
 */
export const markAsRead = async (req, res, next) => {
  try {
    const notification = await NotificationService.markAsRead(
      req.params.id,
      req.user.id
    );

    res.status(200).json({
      status: 'success',
      data: {
        notification
      }
    });
  } catch (error) {
    next(new AppError('Notification not found', 404));
  }
};

/**
 * @desc    Mark all notifications as read for the current user
 * @route   PATCH /api/notifications/mark-all-read
 * @access  Private
 */
export const markAllAsRead = async (req, res, next) => {
  try {
    await NotificationService.markAllAsRead(req.user.id);
    
    res.status(200).json({
      status: 'success',
      message: 'All notifications marked as read'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a notification
 * @route   DELETE /api/notifications/:id
 * @access  Private
 */
export const deleteNotification = async (req, res, next) => {
  try {
    await NotificationService.deleteNotification(
      req.params.id,
      req.user.id
    );

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    next(new AppError('Notification not found', 404));
  }
};

/**
 * @desc    Clear all notifications for the current user
 * @route   DELETE /api/notifications
 * @access  Private
 */
export const clearAllNotifications = async (req, res, next) => {
  try {
    await Notification.deleteMany({ user: req.user.id });
    
    // Notify the user that all notifications were cleared
    req.app.get('io').to(`user_${req.user.id}`).emit('notifications:cleared');
    
    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    next(error);
  }
};
