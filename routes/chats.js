import express from 'express';
import mongoose from 'mongoose';
import { auth } from '../middleware/auth.js';
import { Chat } from '../models/index.js';

const router = express.Router();

// Create a new chat
router.post('/', auth, async (req, res) => {
  try {
    const { participants: participantsInput, isGroupChat, name, groupImage } = req.body;
    
    // Validate participants
    if (!Array.isArray(participantsInput)) {
      return res.status(400).json({ message: 'Participants must be an array' });
    }
    
    // Filter out any invalid participant IDs
    const participants = participantsInput.filter(id => 
      id && (typeof id === 'string' || typeof id === 'object' && id !== null)
    );
    
    if (participants.length === 0) {
      return res.status(400).json({ message: 'At least one valid participant is required' });
    }
    
    // For one-on-one chat, check if chat already exists
    if (!isGroupChat && participants.length === 1) {
      // For one-on-one chats, find a chat that contains both users in the participants.user subdocument
      const existingChat = await Chat.findOne({
        isGroupChat: false,
        $and: [
          { 'participants.user': req.user.id },
          { 'participants.user': participants[0] }
        ]
      }).populate('participants.user', 'username profilePic');
      
      if (existingChat) {
        return res.json(existingChat);
      }
    }

    // Format participants as objects with required fields
    const formattedParticipants = [
      {
        user: req.user.id,
        lastRead: new Date(),
        unreadCount: 0,
        isAdmin: isGroupChat
      },
      ...participants.map(participant => ({
        user: participant,
        lastRead: new Date(),
        unreadCount: 0,
        isAdmin: false
      }))
    ];

    const chat = new Chat({
      participants: formattedParticipants,
      isGroupChat: isGroupChat || false,
      name: isGroupChat ? name : null,
      groupImage: isGroupChat ? groupImage : null,
      groupAdmin: isGroupChat ? req.user.id : null
    });

  await chat.save();
    
  // Populate participants before sending response (populate the nested user field)
  await chat.populate('participants.user', 'username profilePic');
    
    res.status(201).json(chat);
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({ message: 'Error creating chat' });
  }
});

// Get all chats for a user
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.query.userId || req.user?.id;
    
    if (!userId) {
      console.error('No user ID provided');
      return res.status(400).json({ message: 'User ID is required' });
    }

    // For MongoDB ObjectId validation
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.error('Invalid user ID format:', userId);
      return res.status(400).json({ message: 'Invalid user ID format' });
    }
    
    console.log('Fetching chats for user ID:', userId);
    
    // Find chats where the user is a participant
    const chats = await Chat.find({
      'participants.user': new mongoose.Types.ObjectId(userId)
    })
      .populate('participants.user', 'username profilePic')
      .populate('lastMessage')
      .sort({ updatedAt: -1 });
      
    console.log(`Found ${chats.length} chats for user ${userId}`);
    res.json(chats || []);
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({ 
      message: 'Error fetching chats',
      error: error.message 
    });
  }
});

// Get a single chat
router.get('/:id', auth, async (req, res) => {
  try {
    const chatId = req.params.id;
    const userId = req.user.id;
    
    // Validate chat ID format
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ 
        status: 'fail',
        message: 'Invalid chat ID format' 
      });
    }
    
    // Convert user ID to ObjectId
    const userIdObj = new mongoose.Types.ObjectId(userId);
    
    // Find chat by ID and check if user is a participant
    const chat = await Chat.findOne({
      _id: new mongoose.Types.ObjectId(chatId),
      'participants.user': userIdObj
    })
    .populate({
      path: 'participants.user',
      select: 'username profilePic'
    })
    .populate({
      path: 'lastMessage',
      populate: {
        path: 'senderId',
        select: 'username profilePic'
      }
    })
    .lean();
    
    if (!chat) {
      return res.status(404).json({ 
        status: 'fail',
        message: 'Chat not found or you do not have permission to view this chat' 
      });
    }
    
    // Get messages separately
    const Message = mongoose.model('Message');
    const messages = await Message.find({ chatId: chat._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('senderId', 'username profilePic')
      .lean();
    
    // Convert to plain object and add virtuals
    const chatObj = {
      ...chat,
      id: chat._id.toString(),
      messages: messages.reverse() // Reverse to show oldest first
    };
    
    res.json(chatObj);
  } catch (error) {
    console.error('Error fetching chat:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Error fetching chat',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Add message to chat
router.post('/:id/messages', auth, async (req, res) => {
  try {
    const { content, media } = req.body;
    // Structured debug logs to capture incoming payload and context
    console.log('[POST /:id/messages] Incoming payload:', {
      params: req.params,
      body: req.body,
      user: { id: req.user?.id, username: req.user?.username }
    });
    
    const chat = await Chat.findOne({
      _id: req.params.id,
      // participants is an array of subdocuments { user: ObjectId, ... }
      // query by the nested user field to avoid casting errors
      'participants.user': req.user.id
    }).lean();

    console.log('[POST /:id/messages] Resolved chat (lean):', chat ? { id: chat._id, participants: chat.participants } : null);
    
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    
    const message = {
      content,
      sender: req.user.id,
      media: media || [],
      readBy: [req.user.id]
    };

    console.log('[POST /:id/messages] Constructed message object (pre-save):', message);
    
    // Create a Message document (we do not store messages as an array on Chat)
    const Message = mongoose.model('Message');

    const messageDoc = new Message({
      chatId: req.params.id,
      senderId: req.user.id,
      content: content,
      type: 'text',
      mediaUrl: (media && Array.isArray(media) && media.length > 0) ? media[0] : undefined,
      readBy: [req.user.id]
    });

    await messageDoc.save();

    // Update chat's lastMessage and timestamp
    await Chat.findByIdAndUpdate(req.params.id, { lastMessage: messageDoc._id, updatedAt: new Date() });

    // Populate sender info for the response
    const populated = await Message.findById(messageDoc._id).populate('senderId', 'username profilePic').lean();

    const populatedMessage = {
      id: populated._id.toString(),
      chatId: String(populated.chatId),
      content: populated.content,
      type: populated.type,
      mediaUrl: populated.mediaUrl,
      createdAt: populated.createdAt,
      readBy: Array.isArray(populated.readBy) ? populated.readBy.map(String) : [],
      sender: populated.senderId ? { _id: populated.senderId._id, username: populated.senderId.username, profilePic: populated.senderId.profilePic } : undefined,
      senderId: populated.senderId ? String(populated.senderId._id) : String(req.user.id)
    };

    // Use the previously-lean chat to get participants list (avoid querying again)
    const participantsList = (chat.participants || []).map(p => {
      if (p && (p.user || p.user === 0)) return String(p.user);
      return String(p);
    });

    console.log('[POST /:id/messages] Emitting newMessage to participants:', participantsList);
    const webSocketService = req.app.get('webSocketService');
    const io = webSocketService && webSocketService.io ? webSocketService.io : null;
    if (io) {
      participantsList.forEach(participantUserId => {
        try {
          if (participantUserId && participantUserId !== req.user.id) {
            // Emit to the user's personal room if available; fall back to direct room by id
            const room = `user_${participantUserId}`;
            io.to(room).emit('newMessage', {
              chatId: req.params.id,
              message: populatedMessage
            });
          }
        } catch (emitErr) {
          console.warn('[POST /:id/messages] emit error for participant', participantUserId, emitErr);
        }
      });
    } else {
      console.warn('[POST /:id/messages] No io instance available on app to emit messages');
    }

    res.status(201).json(populatedMessage);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Error sending message' });
  }
});

// Mark messages as read
router.post('/:id/read', auth, async (req, res) => {
  try {
    // Ensure the user is a participant first
    const chat = await Chat.findOne({ _id: req.params.id, 'participants.user': req.user.id });
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    // Use Message model to add the user to readBy for messages in this chat
    const Message = mongoose.model('Message');
    await Message.updateMany(
      { chatId: req.params.id, readBy: { $ne: req.user.id } },
      { $addToSet: { readBy: req.user.id } }
    );

    res.json({ message: 'Messages marked as read' });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ message: 'Error marking messages as read' });
  }
});

// Update group info
router.put('/:id/group', auth, async (req, res) => {
  try {
    const { name, groupImage } = req.body;
    
    const chat = await Chat.findOne({
      _id: req.params.id,
      isGroupChat: true,
      groupAdmin: req.user.id
    });
    
    if (!chat) {
      return res.status(404).json({ message: 'Group chat not found or not authorized' });
    }
    
    if (name) chat.name = name;
    if (groupImage) chat.groupImage = groupImage;
    
    await chat.save();
    
    res.json(chat);
  } catch (error) {
    console.error('Error updating group:', error);
    res.status(500).json({ message: 'Error updating group' });
  }
});

// Add/remove group participants
router.post('/:id/participants', auth, async (req, res) => {
  try {
    const { userId, action = 'add' } = req.body;
    
    const chat = await Chat.findOne({
      _id: req.params.id,
      isGroupChat: true,
      groupAdmin: req.user.id
    });
    
    if (!chat) {
      return res.status(404).json({ message: 'Group chat not found or not authorized' });
    }
    
    if (action === 'add') {
      // Check if user is already a participant (compare nested .user field)
      if (chat.participants.some(p => String(p.user) === String(userId))) {
        return res.status(400).json({ message: 'User is already in the group' });
      }
      // Push a properly-shaped participant subdocument so Mongoose doesn't try to cast a string into a subdoc
      chat.participants.push({
        user: userId,
        lastRead: new Date(),
        unreadCount: 0,
        isAdmin: false
      });
    } else if (action === 'remove') {
      // Don't allow removing the admin
      if (userId === String(chat.groupAdmin)) {
        return res.status(400).json({ message: 'Cannot remove group admin' });
      }
      // Remove participant subdocument by matching the nested .user id
      chat.participants = chat.participants.filter(
        participant => String(participant.user) !== String(userId)
      );
    }
    
    await chat.save();
    
  // Populate participants before sending response (populate the nested user field)
  await chat.populate('participants.user', 'username profilePic');
    
    res.json(chat);
  } catch (error) {
    console.error('Error updating participants:', error);
    res.status(500).json({ message: 'Error updating participants' });
  }
});

export default router;
