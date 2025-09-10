import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Chat from '../models/Chat.js';
import { dbGet } from '../config/db.js';
import WebSocketEvents from './websocketEvents.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export class WebSocketService {
  constructor(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL?.split(',') || '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true,
        allowedHeaders: ['Authorization'],
        exposedHeaders: ['Authorization']
      },
      connectionStateRecovery: {
        maxDisconnectionDuration: 5 * 60 * 1000, // 5 minutes
        skipMiddlewares: true,
      },
      pingTimeout: 60000, // 60 seconds
      pingInterval: 25000, // 25 seconds
      maxHttpBufferSize: 1e8, // 100MB
    });
    
    // Store user socket connections
    this.userSockets = new Map(); // userId -> Set of socketIds
    this.socketToUser = new Map(); // socketId -> { userId, username, role, profilePic }
    this.onlineUsers = new Set(); // Set of online user IDs
    this.typingUsers = new Map(); // chatId -> Set of user IDs who are typing
    this.onlineStatus = new Map(); // userId -> { status, lastSeen }
    
    // Initialize event handlers
    this.events = new WebSocketEvents(this.io);
    
    this.setupConnectionHandling();
  }
  
  async setupConnectionHandling() {
    this.io.use(async (socket, next) => {
      try {
        // Try to get token from auth header or query params
        let token = socket.handshake.auth.token || 
                   socket.handshake.headers.authorization?.split(' ')[1] ||
                   socket.handshake.query.token;
        
        if (!token) {
          return next(new Error('Authentication error: No token provided'));
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id).select('username profilePic status role');
        
        if (!user) {
          return next(new Error('Authentication error: User not found'));
        }

        // Attach user to socket with additional context
        socket.user = {
          _id: user._id,
          username: user.username,
          profilePic: user.profilePic,
          role: user.role || 'user',
          status: user.status || 'offline'
        };
        
        next();
      } catch (error) {
        console.error('Socket auth error:', error);
        if (error.name === 'TokenExpiredError') {
          return next(new Error('Authentication error: Token expired'));
        }
        next(new Error('Authentication error: Invalid token'));
      }
    });

    this.io.on('connection', async (socket) => {
      const { id: socketId } = socket;
      const { _id: userId, username, profilePic, role } = socket.user;

      console.log(`New WebSocket connection: ${socketId} (User: ${username}, Role: ${role})`);

      // Initialize user's socket connections
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId).add(socketId);
      this.socketToUser.set(socketId, { userId, username, profilePic, role });
      this.onlineUsers.add(userId);
      this.onlineStatus.set(userId, { 
        status: 'online', 
        lastSeen: null,
        device: socket.handshake.headers['user-agent'] || 'unknown'
      });

      // Notify user's contacts and relevant channels about online status
      this.notifyUserStatus(userId, true);

      // Join user's personal room and relevant channels
      socket.join([
        `user_${userId}`,
        'global_updates',
        `user_role_${role}`,
        `user_${userId}_notifications`
      ]);
      
      // Join study groups the user is part of
      const studyGroups = await this.events.getUserStudyGroups(userId);
      studyGroups.forEach(group => {
        socket.join(`study_group_${group.id}`);
      });
      
      // Join forum threads the user is subscribed to
      const forumSubscriptions = await this.events.getUserForumSubscriptions(userId);
      forumSubscriptions.forEach(threadId => {
        socket.join(`forum_thread_${threadId}`);
      });

      // Handle chat messages
      socket.on('send_message', async (data) => {
        try {
          const { chatId, content, media = [] } = data;
          const chat = await Chat.findById(chatId);

          if (!chat) {
            return socket.emit('error', { message: 'Chat not found' });
          }

          // Check if user is a participant
          if (!chat.participants.some(p => p.toString() === userId.toString())) {
            return socket.emit('error', { message: 'Not authorized to send messages in this chat' });
          }

          // Create new message
          const message = {
            content,
            sender: userId,
            media,
            readBy: [userId]
          };

          // Add message to chat
          chat.messages.push(message);
          chat.lastMessage = message;
          await chat.save();

          // Populate sender info for the response
          const populatedMessage = {
            ...message,
            sender: {
              _id: userId,
              username,
              profilePic
            },
            createdAt: new Date()
          };

          // Emit to all participants
          this.io.to(`chat_${chatId}`).emit('new_message', {
            chatId,
            message: populatedMessage
          });

          // Update last message in participants' chat lists
          this.notifyChatUpdate(chat);

        } catch (error) {
          console.error('Error sending message:', error);
          socket.emit('error', { message: 'Error sending message' });
        }
      });

      // Handle typing indicator
      socket.on('typing', async ({ chatId, isTyping }) => {
        try {
          const chat = await Chat.findById(chatId);
          
          if (!chat || !chat.participants.some(p => p.toString() === userId.toString())) {
            return;
          }

          // Update typing status
          if (isTyping) {
            if (!this.typingUsers.has(chatId)) {
              this.typingUsers.set(chatId, new Set());
            }
            this.typingUsers.get(chatId).add(userId);
          } else {
            if (this.typingUsers.has(chatId)) {
              this.typingUsers.get(chatId).delete(userId);
              if (this.typingUsers.get(chatId).size === 0) {
                this.typingUsers.delete(chatId);
              }
            }
          }

          // Broadcast typing status to other participants
          socket.to(`chat_${chatId}`).emit('user_typing', {
            chatId,
            userId,
            username,
            isTyping
          });
        } catch (error) {
          console.error('Error handling typing indicator:', error);
        }
      });

      // Handle read receipts
      socket.on('mark_as_read', async ({ chatId, messageId }) => {
        try {
          const chat = await Chat.findOneAndUpdate(
            {
              _id: chatId,
              'messages._id': messageId,
              'messages.readBy': { $ne: userId }
            },
            {
              $addToSet: { 'messages.$.readBy': userId }
            },
            { new: true }
          );

          if (chat) {
            // Notify other participants about the read receipt
            socket.to(`chat_${chatId}`).emit('message_read', {
              chatId,
              messageId,
              userId
            });
          }
        } catch (error) {
          console.error('Error marking message as read:', error);
        }
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        console.log(`Socket disconnected: ${socketId} (User: ${username}, Reason: ${reason})`);
        
        // Remove socket from user's connections
        if (this.userSockets.has(userId)) {
          const userSockets = this.userSockets.get(userId);
          userSockets.delete(socketId);
          
          // If no more sockets for this user, mark as offline
          if (userSockets.size === 0) {
            this.userSockets.delete(userId);
            this.onlineUsers.delete(userId);
            const lastSeen = new Date();
            this.onlineStatus.set(userId, { 
              status: 'offline', 
              lastSeen,
              device: socket.handshake.headers['user-agent'] || 'unknown'
            });
            this.notifyUserStatus(userId, false);
            
            // Update last seen in database
            User.findByIdAndUpdate(userId, { 
              lastSeen,
              $set: { 'status': 'offline' }
            }).catch(console.error);
          }
        }
        
        // Clean up typing indicators
        this.typingUsers.forEach((users, chatId) => {
          if (users.has(userId)) {
            users.delete(userId);
            if (users.size === 0) {
              this.typingUsers.delete(chatId);
            } else {
              // Notify others that user stopped typing
              this.io.to(`chat_${chatId}`).emit('user_typing', {
                chatId,
                userId,
                username,
                isTyping: false
              });
            }
          }
        });
      });

      // Handle announcements
      socket.on('announcement_read', async ({ announcementId }) => {
        try {
          const announcement = await Announcement.findById(announcementId);
          if (announcement) {
            announcement.readBy.push(userId);
            await announcement.save();
            socket.emit('announcement_read', { announcementId });
          }
        } catch (error) {
          console.error('Error marking announcement as read:', error);
        }
      });

      // Handle forum posts
      socket.on('forum_post_read', async ({ postId }) => {
        try {
          const post = await Post.findById(postId);
          if (post) {
            post.readBy.push(userId);
            await post.save();
            socket.emit('forum_post_read', { postId });
          }
        } catch (error) {
          console.error('Error marking forum post as read:', error);
        }
      });

      // Handle study group updates
      socket.on('study_group_update', async ({ groupId, update }) => {
        try {
          const group = await StudyGroup.findById(groupId);
          if (group) {
            group.updates.push(update);
            await group.save();
            socket.emit('study_group_update', { groupId, update });
          }
        } catch (error) {
          console.error('Error updating study group:', error);
        }
      });
    });
  }
  
  /**
   * Notify all contacts about user's online/offline status
   * @param {string} userId - The user ID
   * @param {boolean} isOnline - Whether the user is online
   */
  async notifyUserStatus(userId, isOnline) {
    try {
      const statusUpdate = {
        status: isOnline ? 'online' : 'offline',
        lastSeen: isOnline ? null : new Date(),
        updatedAt: new Date()
      };
      
      // Update user's status in memory
      const userStatus = this.onlineStatus.get(userId) || {};
      this.onlineStatus.set(userId, { 
        ...userStatus, 
        ...statusUpdate,
        lastSeen: isOnline ? null : new Date()
      });

      // Update user's status in the database (non-blocking)
      User.findByIdAndUpdate(userId, statusUpdate, { new: true })
        .then(updatedUser => {
          if (updatedUser) {
            // Emit to user's personal room and relevant channels
            const statusEvent = {
              userId,
              isOnline,
              lastSeen: isOnline ? null : statusUpdate.lastSeen,
              updatedAt: statusUpdate.updatedAt
            };
            
            // Notify user's direct contacts
            this.io.to(`user_${userId}_contacts`).emit('user_status', statusEvent);
            
            // Notify study groups the user is in
            this.events.getUserStudyGroups(userId).then(groups => {
              groups.forEach(group => {
                this.io.to(`study_group_${group.id}`).emit('member_status', {
                  ...statusEvent,
                  groupId: group.id
                });
              });
            });
            
            // Notify admins if user is an admin
            if (updatedUser.role === 'admin' || updatedUser.role === 'moderator') {
              this.io.to('admin_dashboard').emit('admin_status', statusEvent);
            }
          }
        })
        .catch(console.error);
    } catch (error) {
      console.error('Error notifying user status:', error);
    }
  }

  /**
   * Notify chat participants about a new message
   * @param {Object} chat - The chat document
   */
  notifyChatUpdate(chat) {
    chat.participants.forEach(participantId => {
      this.io.to(`user_${participantId}`).emit('chat_updated', {
        chatId: chat._id,
        lastMessage: chat.lastMessage
      });
    });
  }

  /**
   * Notify participants about a new group chat
   * @param {Array} participantIds - Array of participant user IDs
   * @param {Object} chat - The new chat data
   */
  notifyNewGroupChat(participantIds, chat) {
    participantIds.forEach(userId => {
      this.io.to(`user_${userId}`).emit('new_group_chat', { chat });
    });
  }

  /**
   * Notify chat participants about a new member
   * @param {string} chatId - The chat ID
   * @param {string} userId - The new member's user ID
   * @param {string} addedById - The ID of the user who added the new member
   */
  notifyNewChatMember(chatId, userId, addedById) {
    this.io.to(`chat_${chatId}`).emit('new_chat_member', {
      chatId,
      userId,
      addedById,
      timestamp: new Date()
    });
  }

  /**
   * Notify about a new announcement
   * @param {Object} announcement - The announcement data
   * @param {Array} targetRoles - Optional array of role names to target
   */
  async notifyNewAnnouncement(announcement, targetRoles = []) {
    return this.events.handleAnnouncement(announcement, targetRoles);
  }

  /**
   * Notify about a new forum post or thread
   * @param {Object} post - The post data
   * @param {string} threadId - The thread ID
   * @param {string} type - Either 'new_thread' or 'new_reply'
   */
  async notifyNewForumPost(post, threadId, type = 'new_reply') {
    return this.events.handleForumPost(post, threadId, type);
  }

  /**
   * Notify about study group updates
   * @param {string} groupId - The study group ID
   * @param {Object} data - The update data
   * @param {string} eventType - The type of event (e.g., 'new_member', 'new_session', 'update')
   */
  async notifyStudyGroupUpdate(groupId, data, eventType = 'update') {
    return this.events.handleStudyGroupUpdate(groupId, data, eventType);
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
    return this.events.sendDirectMessage(userId, message);
  }

  /**
   * Store a message for offline users
   * @private
   */
  async storeOfflineMessage(userId, message) {
    return this.events.storeOfflineMessage(userId, message);
  }
}

export default WebSocketService;
