import Notification from '../models/Notification.js';
import User from '../models/User.js';
import NotificationService from '../services/notificationService.js';
import { sendPushNotification } from '../services/pushNotificationService.js';
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
    const webSocketService = req.app.get('webSocketService');
    const io = webSocketService && webSocketService.io ? webSocketService.io : null;
    if (io) {
      io.to(`user_${req.user.id}`).emit('notifications:cleared');
    } else {
      console.warn('[NotificationController] No io instance available to emit notifications:cleared');
    }

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Register push notification token
 * @route   POST /api/notifications/register-push-token
 * @access  Private
 */
export const registerPushToken = async (req, res, next) => {
  try {
    const { pushToken, deviceType } = req.body;

    if (!pushToken) {
      return next(new AppError('Push token is required', 400));
    }

    // Update user's push token
    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        pushToken,
        pushTokenUpdatedAt: new Date(),
        deviceType: deviceType || 'unknown'
      },
      { new: true }
    );

    res.status(200).json({
      status: 'success',
      message: 'Push token registered successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Remove push notification token
 * @route   DELETE /api/notifications/push-token
 * @access  Private
 */
export const removePushToken = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user.id, {
      pushToken: null,
      pushTokenUpdatedAt: new Date()
    });

    res.status(200).json({
      status: 'success',
      message: 'Push token removed successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get notification preferences
 * @route   GET /api/notifications/preferences
 * @access  Private
 */
export const getNotificationPreferences = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('settings.notifications');

    res.status(200).json({
      status: 'success',
      data: {
        preferences: user?.settings?.notifications || {
          push: true,
          email: true,
          messages: true,
          mentions: true,
          classReminders: true,
          assignmentReminders: true,
          eventReminders: true,
          studyBuddyUpdates: true,
          announcements: true,
          quietHoursEnabled: false,
          quietHoursStart: '22:00',
          quietHoursEnd: '07:00'
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update notification preferences
 * @route   PUT /api/notifications/preferences
 * @access  Private
 */
export const updateNotificationPreferences = async (req, res, next) => {
  try {
    const {
      push,
      email,
      messages,
      mentions,
      classReminders,
      assignmentReminders,
      eventReminders,
      studyBuddyUpdates,
      announcements,
      quietHoursEnabled,
      quietHoursStart,
      quietHoursEnd
    } = req.body;

    const updateObj = {};

    if (typeof push === 'boolean') updateObj['settings.notifications.push'] = push;
    if (typeof email === 'boolean') updateObj['settings.notifications.email'] = email;
    if (typeof messages === 'boolean') updateObj['settings.notifications.messages'] = messages;
    if (typeof mentions === 'boolean') updateObj['settings.notifications.mentions'] = mentions;
    if (typeof classReminders === 'boolean') updateObj['settings.notifications.classReminders'] = classReminders;
    if (typeof assignmentReminders === 'boolean') updateObj['settings.notifications.assignmentReminders'] = assignmentReminders;
    if (typeof eventReminders === 'boolean') updateObj['settings.notifications.eventReminders'] = eventReminders;
    if (typeof studyBuddyUpdates === 'boolean') updateObj['settings.notifications.studyBuddyUpdates'] = studyBuddyUpdates;
    if (typeof announcements === 'boolean') updateObj['settings.notifications.announcements'] = announcements;
    if (typeof quietHoursEnabled === 'boolean') updateObj['settings.notifications.quietHoursEnabled'] = quietHoursEnabled;
    if (quietHoursStart) updateObj['settings.notifications.quietHoursStart'] = quietHoursStart;
    if (quietHoursEnd) updateObj['settings.notifications.quietHoursEnd'] = quietHoursEnd;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateObj },
      { new: true }
    ).select('settings.notifications');

    res.status(200).json({
      status: 'success',
      data: {
        preferences: user.settings.notifications
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Send test push notification
 * @route   POST /api/notifications/test
 * @access  Private
 */
export const testPushNotification = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('+pushToken');

    if (!user.pushToken) {
      return next(new AppError('No push token registered. Please enable notifications first.', 400));
    }

    const result = await sendPushNotification(user.pushToken, {
      title: '🔔 Test Notification',
      body: 'This is a test notification from CampusOS!',
      data: { type: 'test' }
    });

    res.status(200).json({
      status: 'success',
      message: 'Test notification sent',
      result
    });
  } catch (error) {
    next(error);
  }
};

