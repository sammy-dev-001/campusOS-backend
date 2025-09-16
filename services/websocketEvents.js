import mongoose from 'mongoose';
import User from '../models/User.js';
import Group from '../models/Group.js';
import ForumThread from '../models/ForumThread.js';
import ForumSubscription from '../models/ForumSubscription.js';

export class WebSocketEvents {
  constructor(io) {
    this.io = io;
  }

  /**
   * Get user's study groups
   * @param {string} userId - The user ID
   * @returns {Promise<Array>} Array of group IDs the user is a member of
   */
  async getUserStudyGroups(userId) {
    try {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return [];
      }
      
      const user = await User.findById(userId).populate('groups');
      if (!user) {
        return [];
      }
      
      // Return array of group IDs the user is a member of
      return user.groups || [];
    } catch (error) {
      console.error('Error getting user study groups:', error);
      return [];
    }
  }

  /**
   * Get user's forum thread subscriptions
   * @param {string} userId - The user ID
   * @returns {Promise<Array>} Array of thread IDs the user is subscribed to
   */
  async getUserForumSubscriptions(userId) {
    try {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return [];
      }
      
      const subscriptions = await ForumSubscription.find({ user: userId });
      return subscriptions.map(sub => sub.thread.toString());
    } catch (error) {
      console.error('Error getting forum subscriptions:', error);
      return [];
    }
  }

  /**
   * Handle announcement events
   * @param {Object} data - The announcement data
   * @param {Array} targetRoles - Optional array of role names to target
   */
  async handleAnnouncement(data, targetRoles = []) {
    try {
      const eventData = {
        ...data,
        createdAt: new Date(data.created_at || Date()),
        isNew: true
      };

      // Emit to specific roles if specified
      if (targetRoles && targetRoles.length > 0) {
        targetRoles.forEach(role => {
          this.io.to(`user_role_${role}`).emit('new_announcement', eventData);
        });
      } else {
        // Emit to everyone if no specific roles are targeted
        this.io.emit('new_announcement', eventData);
      }

      // Also emit to the announcement's specific room for targeted updates
      if (data.id) {
        this.io.to(`announcement_${data.id}`).emit('announcement_updated', eventData);
      }
    } catch (error) {
      console.error('Error handling announcement:', error);
    }
  }

  /**
   * Handle forum post events
   * @param {Object} post - The post data
   * @param {string} threadId - The thread ID
   * @param {string} type - Either 'new_thread' or 'new_reply'
   */
  async handleForumPost(post, threadId, type = 'new_reply') {
    try {
      const eventData = {
        ...post,
        threadId,
        type,
        timestamp: new Date()
      };

      // Emit to thread subscribers
      this.io.to(`forum_thread_${threadId}`).emit('forum_update', eventData);
      
      // If it's a new thread, also emit to relevant category subscribers
      if (type === 'new_thread' && post.category) {
        this.io.to(`forum_category_${post.category}`).emit('new_forum_thread', eventData);
      }
      
      // Notify thread author about new replies (if not the author)
      if (type === 'new_reply' && post.threadAuthorId && post.threadAuthorId !== post.authorId) {
        this.io.to(`user_${post.threadAuthorId}`).emit('forum_reply', eventData);
      }
    } catch (error) {
      console.error('Error handling forum post:', error);
    }
  }

  /**
   * Handle study group events
   * @param {string} groupId - The study group ID
   * @param {Object} data - The event data
   * @param {string} eventType - The type of event (e.g., 'new_member', 'new_session', 'update')
   */
  async handleStudyGroupUpdate(groupId, data, eventType = 'update') {
    try {
      const eventData = {
        groupId,
        ...data,
        timestamp: new Date(),
        eventType
      };

      // Emit to group members
      this.io.to(`study_group_${groupId}`).emit('study_group_update', eventData);
      
      // For new members, also send a direct notification
      if (eventType === 'new_member' && data.userId) {
        this.io.to(`user_${data.userId}`).emit('study_group_invite', eventData);
      }
    } catch (error) {
      console.error('Error handling study group update:', error);
    }
  }

  /**
   * Send a direct message to a user
   * @param {string} userId - The recipient user ID
   * @param {Object} message - The message data
   * @param {string} message.type - The message type (e.g., 'notification', 'alert', 'message')
   * @param {string} message.title - The message title
   * @param {string} message.content - The message content
   * @param {Object} message.data - Additional data
   */
  sendDirectMessage(userId, message) {
    const messageData = {
      ...message,
      id: message.id || `msg_${Date.now()}`,
      timestamp: message.timestamp || new Date(),
      read: false
    };

    // Emit to user's personal notification room
    this.io.to(`user_${userId}_notifications`).emit('direct_message', messageData);
    
    // If user is offline, store for later delivery
    if (!this.onlineUsers || !this.onlineUsers.has(userId)) {
      this.storeOfflineMessage(userId, messageData);
    }
  }

  /**
   * Store a message for offline users
   * @private
   */
  async storeOfflineMessage(userId, message) {
    try {
      // In a real app, you would store this in a database
      console.log(`Storing offline message for user ${userId}:`, message);
    } catch (error) {
      console.error('Error storing offline message:', error);
    }
  }
}

export default WebSocketEvents;
