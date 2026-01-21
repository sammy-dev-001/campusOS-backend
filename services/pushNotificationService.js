/**
 * Push Notification Service
 * Handles sending push notifications via Expo Push Notification Service
 */
import { Expo } from 'expo-server-sdk';

// Create a new Expo SDK client
const expo = new Expo();

/**
 * Send push notification to a single user
 * @param {string} pushToken - User's Expo push token
 * @param {object} notification - Notification content
 * @returns {Promise<object>} - Result of the push
 */
export const sendPushNotification = async (pushToken, notification) => {
    if (!pushToken || !Expo.isExpoPushToken(pushToken)) {
        console.warn(`Invalid push token: ${pushToken}`);
        return { success: false, error: 'Invalid push token' };
    }

    const message = {
        to: pushToken,
        sound: notification.sound || 'default',
        title: notification.title,
        body: notification.body,
        data: notification.data || {},
        priority: notification.priority || 'high',
        channelId: notification.channelId || 'default',
        badge: notification.badge,
        categoryId: notification.categoryId,
    };

    try {
        const [ticket] = await expo.sendPushNotificationsAsync([message]);

        if (ticket.status === 'error') {
            console.error(`Push notification error: ${ticket.message}`);
            return { success: false, error: ticket.message, details: ticket.details };
        }

        return { success: true, ticketId: ticket.id };
    } catch (error) {
        console.error('Error sending push notification:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send push notifications to multiple users
 * @param {Array} notifications - Array of { pushToken, notification } objects
 * @returns {Promise<Array>} - Results for each notification
 */
export const sendBatchPushNotifications = async (notifications) => {
    // Filter valid tokens
    const messages = notifications
        .filter(({ pushToken }) => pushToken && Expo.isExpoPushToken(pushToken))
        .map(({ pushToken, notification }) => ({
            to: pushToken,
            sound: notification.sound || 'default',
            title: notification.title,
            body: notification.body,
            data: notification.data || {},
            priority: notification.priority || 'high',
            channelId: notification.channelId || 'default',
        }));

    if (messages.length === 0) {
        return [];
    }

    // Chunk messages (Expo recommends max 100 per request)
    const chunks = expo.chunkPushNotifications(messages);
    const results = [];

    for (const chunk of chunks) {
        try {
            const tickets = await expo.sendPushNotificationsAsync(chunk);
            results.push(...tickets);
        } catch (error) {
            console.error('Error sending batch notifications:', error);
            results.push({ status: 'error', message: error.message });
        }
    }

    return results;
};

/**
 * Send notification to user by ID
 * @param {object} User - User model
 * @param {string} userId - User's database ID
 * @param {object} notification - Notification content
 */
export const sendNotificationToUser = async (User, userId, notification) => {
    try {
        const user = await User.findById(userId).select('+pushToken settings.notifications');

        if (!user) {
            return { success: false, error: 'User not found' };
        }

        // Check if user has push notifications enabled
        if (!user.settings?.notifications?.push) {
            return { success: false, error: 'User has push notifications disabled' };
        }

        if (!user.pushToken) {
            return { success: false, error: 'User has no push token registered' };
        }

        return await sendPushNotification(user.pushToken, notification);
    } catch (error) {
        console.error('Error sending notification to user:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send notification to multiple users by IDs
 * @param {object} User - User model
 * @param {Array} userIds - Array of user IDs
 * @param {object} notification - Notification content
 */
export const sendNotificationToUsers = async (User, userIds, notification) => {
    try {
        const users = await User.find({
            _id: { $in: userIds },
            'settings.notifications.push': true
        }).select('+pushToken');

        const notifications = users
            .filter(user => user.pushToken)
            .map(user => ({ pushToken: user.pushToken, notification }));

        return await sendBatchPushNotifications(notifications);
    } catch (error) {
        console.error('Error sending notifications to users:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Notification templates for common events
 */
export const NotificationTemplates = {
    classReminder: (className, time, location) => ({
        title: '📚 Class Starting Soon',
        body: `${className} starts in ${time} at ${location}`,
        data: { type: 'class_reminder', className, location },
        channelId: 'class-reminders',
    }),

    assignmentDue: (assignmentName, timeLeft) => ({
        title: '📝 Assignment Due',
        body: `${assignmentName} is due in ${timeLeft}`,
        data: { type: 'assignment_reminder', assignmentName },
        channelId: 'assignments',
    }),

    eventReminder: (eventName, time) => ({
        title: '🎉 Event Reminder',
        body: `${eventName} starts in ${time}`,
        data: { type: 'event_reminder', eventName },
        channelId: 'events',
    }),

    newMessage: (senderName, preview) => ({
        title: `💬 ${senderName}`,
        body: preview.length > 50 ? `${preview.substring(0, 47)}...` : preview,
        data: { type: 'new_message', senderName },
        channelId: 'messages',
    }),

    studyBuddyMatch: (matchedUserName) => ({
        title: '🎓 New Study Buddy Match!',
        body: `You've been matched with ${matchedUserName}`,
        data: { type: 'study_buddy_match', matchedUserName },
        channelId: 'social',
    }),

    studyBuddyRequest: (requesterName) => ({
        title: '🤝 Study Buddy Request',
        body: `${requesterName} wants to be your study buddy`,
        data: { type: 'study_buddy_request', requesterName },
        channelId: 'social',
    }),

    eventRsvp: (eventName, attendeeName) => ({
        title: '✅ New RSVP',
        body: `${attendeeName} is attending ${eventName}`,
        data: { type: 'event_rsvp', eventName, attendeeName },
        channelId: 'events',
    }),

    announcement: (title, sender) => ({
        title: '📢 New Announcement',
        body: `${sender}: ${title}`,
        data: { type: 'announcement', title, sender },
        channelId: 'announcements',
    }),

    gradePosted: (courseName) => ({
        title: '📊 Grade Posted',
        body: `A new grade has been posted for ${courseName}`,
        data: { type: 'grade_posted', courseName },
        channelId: 'academics',
    }),
};

export default {
    sendPushNotification,
    sendBatchPushNotifications,
    sendNotificationToUser,
    sendNotificationToUsers,
    NotificationTemplates,
};
