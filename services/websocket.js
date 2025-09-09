import { Server } from 'socket.io';

export class WebSocketService {
  constructor(server) {
    this.io = new Server(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });
    
    // Store user socket connections
    this.userSockets = new Map(); // userId -> socketId
    this.socketToUser = new Map(); // socketId -> userId
    this.groupSubscriptions = new Map(); // groupId -> Set of socketIds
    
    this.setupConnectionHandling();
  }
  
  setupConnectionHandling() {
    this.io.on('connection', (socket) => {
      console.log('New WebSocket connection:', socket.id);
      
      // Listen for authentication
      socket.on('authenticate', ({ userId }) => {
        if (!userId) {
          socket.disconnect(true);
          return;
        }
        
        console.log(`User ${userId} authenticated on socket ${socket.id}`);
        this.userSockets.set(userId, socket.id);
        this.socketToUser.set(socket.id, userId);
        
        // Join user's personal room for direct messages
        socket.join(`user_${userId}`);
      });
      
      // Handle group subscriptions
      socket.on('subscribe', ({ groupId }) => {
        if (!groupId) return;
        
        socket.join(`group_${groupId}`);
        
        // Track group subscriptions
        if (!this.groupSubscriptions.has(groupId)) {
          this.groupSubscriptions.set(groupId, new Set());
        }
        this.groupSubscriptions.get(groupId).add(socket.id);
        
        console.log(`Socket ${socket.id} subscribed to group ${groupId}`);
      });
      
      // Handle group unsubscriptions
      socket.on('unsubscribe', ({ groupId }) => {
        if (!groupId) return;
        
        socket.leave(`group_${groupId}`);
        
        if (this.groupSubscriptions.has(groupId)) {
          const groupSockets = this.groupSubscriptions.get(groupId);
          groupSockets.delete(socket.id);
          
          if (groupSockets.size === 0) {
            this.groupSubscriptions.delete(groupId);
          }
        }
      });
      
      // Handle disconnection
      socket.on('disconnect', () => {
        const userId = this.socketToUser.get(socket.id);
        console.log(`Socket ${socket.id} disconnected (User: ${userId || 'unknown'})`);
        
        if (userId) {
          this.userSockets.delete(userId);
        }
        this.socketToUser.delete(socket.id);
        
        // Clean up group subscriptions
        this.groupSubscriptions.forEach((sockets, groupId) => {
          if (sockets.has(socket.id)) {
            sockets.delete(socket.id);
            if (sockets.size === 0) {
              this.groupSubscriptions.delete(groupId);
            }
          }
        });
      });
    });
  }
  
  /**
   * Broadcast an event to all members of a group
   * @param {string} groupId - The group ID to broadcast to
   * @param {string} event - The event name
   * @param {*} data - The data to send
   */
  broadcastToGroup(groupId, event, data) {
    if (!groupId) {
      // If no groupId, broadcast to all connected clients
      this.io.emit(event, data);
      return;
    }
    
    console.log(`Broadcasting ${event} to group ${groupId}`);
    this.io.to(`group_${groupId}`).emit(event, data);
  }
  
  /**
   * Send a direct message to a specific user
   * @param {string} userId - The target user ID
   * @param {string} event - The event name
   * @param {*} data - The data to send
   */
  sendToUser(userId, event, data) {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.io.to(socketId).emit(event, data);
    }
  }
  
  /**
   * Notify a user about a new poll in their group
   * @param {string} userId - The user ID to notify
   * @param {object} poll - The poll data
   */
  notifyNewPoll(userId, poll) {
    this.sendToUser(userId, 'new_poll', { poll });
  }
  
  /**
   * Notify a group about a poll update (new vote, etc.)
   * @param {string} groupId - The group ID
   * @param {object} poll - The updated poll data
   */
  notifyPollUpdate(groupId, poll) {
    this.broadcastToGroup(groupId, 'poll_updated', { poll });
  }
  
  /**
   * Notify a user that their vote was recorded
   * @param {string} userId - The user ID
   * @param {string} pollId - The poll ID
   * @param {string} optionId - The option ID that was voted for
   */
  notifyVoteRecorded(userId, pollId, optionId) {
    this.sendToUser(userId, 'vote_recorded', { pollId, optionId });
  }
}

export default WebSocketService;
