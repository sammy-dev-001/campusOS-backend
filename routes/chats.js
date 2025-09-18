import express from 'express';
import mongoose from 'mongoose';
import { auth } from '../middleware/auth.js';
import { Chat, User } from '../models/index.js';

const router = express.Router();

// Create a new chat
router.post('/', auth, async (req, res) => {
  try {
    const { participants, isGroupChat, name, groupImage } = req.body;
    
    // For one-on-one chat, check if chat already exists
    if (!isGroupChat && participants.length === 1) {
      const existingChat = await Chat.findOne({
        isGroupChat: false,
        participants: { $all: [req.user.id, participants[0]] }
      }).populate('participants', 'username profilePic');
      
      if (existingChat) {
        return res.json(existingChat);
      }
    }

    const chat = new Chat({
      participants: [req.user.id, ...participants],
      isGroupChat: isGroupChat || false,
      name: isGroupChat ? name : null,
      groupImage: isGroupChat ? groupImage : null,
      groupAdmin: isGroupChat ? req.user.id : null
    });

    await chat.save();
    
    // Populate participants before sending response
    await chat.populate('participants', 'username profilePic');
    
    res.status(201).json(chat);
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({ message: 'Error creating chat' });
  }
});

// Get all chats for a user
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.query.userId || req.user.id;
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }
    
    // Convert userId to ObjectId if it's a valid string
    let userIdObj;
    try {
      userIdObj = mongoose.Types.ObjectId(userId);
    } catch (err) {
      console.error('Invalid user ID format:', userId);
      return res.status(400).json({ message: 'Invalid user ID format' });
    }
    
    console.log('Fetching chats for user ID:', userId);
    
    const chats = await Chat.find({
      participants: userIdObj
    })
      .populate('participants', 'username profilePic')
      .populate('lastMessage')
      .sort({ updatedAt: -1 });
      
    console.log(`Found ${chats.length} chats for user ${userId}`);
    res.json(chats);
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
    const chat = await Chat.findOne({
      _id: req.params.id,
      participants: req.user.id
    })
      .populate('participants', 'username profilePic')
      .populate({
        path: 'messages',
        populate: {
          path: 'sender',
          select: 'username profilePic'
        },
        options: { sort: { createdAt: -1 }, limit: 50 }
      });
      
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    
    res.json(chat);
  } catch (error) {
    console.error('Error fetching chat:', error);
    res.status(500).json({ message: 'Error fetching chat' });
  }
});

// Add message to chat
router.post('/:id/messages', auth, async (req, res) => {
  try {
    const { content, media } = req.body;
    
    const chat = await Chat.findOne({
      _id: req.params.id,
      participants: req.user.id
    });
    
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    
    const message = {
      content,
      sender: req.user.id,
      media: media || [],
      readBy: [req.user.id]
    };
    
    chat.messages.push(message);
    chat.lastMessage = message;
    await chat.save();
    
    // Populate sender info before sending response
    const populatedMessage = {
      ...message,
      sender: {
        _id: req.user.id,
        username: req.user.username,
        profilePic: req.user.profilePic
      }
    };
    
    // Emit new message to all participants
    chat.participants.forEach(participantId => {
      if (participantId.toString() !== req.user.id) {
        req.app.get('io').to(participantId.toString()).emit('newMessage', {
          chatId: chat._id,
          message: populatedMessage
        });
      }
    });
    
    res.status(201).json(populatedMessage);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Error sending message' });
  }
});

// Mark messages as read
router.post('/:id/read', auth, async (req, res) => {
  try {
    const chat = await Chat.findOne({
      _id: req.params.id,
      participants: req.user.id
    });
    
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    
    // Mark all unread messages as read
    chat.messages.forEach(message => {
      if (!message.readBy.includes(req.user.id)) {
        message.readBy.push(req.user.id);
      }
    });
    
    await chat.save();
    
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
      // Check if user is already a participant
      if (chat.participants.includes(userId)) {
        return res.status(400).json({ message: 'User is already in the group' });
      }
      chat.participants.push(userId);
    } else if (action === 'remove') {
      // Don't allow removing the admin
      if (userId === chat.groupAdmin.toString()) {
        return res.status(400).json({ message: 'Cannot remove group admin' });
      }
      chat.participants = chat.participants.filter(
        participant => participant.toString() !== userId
      );
    }
    
    await chat.save();
    
    // Populate participants before sending response
    await chat.populate('participants', 'username profilePic');
    
    res.json(chat);
  } catch (error) {
    console.error('Error updating participants:', error);
    res.status(500).json({ message: 'Error updating participants' });
  }
});

export default router;
