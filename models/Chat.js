import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true
  },
  isGroupChat: {
    type: Boolean,
    default: false
  },
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    lastRead: Date,
    unreadCount: {
      type: Number,
      default: 0
    },
    isAdmin: {
      type: Boolean,
      default: false
    },
    _id: false
  }],
  groupImage: {
    url: String,
    publicId: String // Cloudinary public ID
  },
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  settings: {
    isMuted: {
      type: Boolean,
      default: false
    },
    customNotifications: {
      type: Boolean,
      default: false
    },
    _id: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function (doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes
chatSchema.index({ participants: 1 });
chatSchema.index({ updatedAt: -1 });
chatSchema.index({ 'participants': 1, 'updatedAt': -1 });

// Virtual for unread message count
chatSchema.virtual('unreadCount').get(function() {
  return this.messages.filter(msg => !msg.readBy.includes(this.currentUser)).length;
});

// Pre-remove hook to delete group image from Cloudinary
chatSchema.pre('remove', async function(next) {
  try {
    if (this.groupImage && this.groupImage.publicId) {
      const { cloudinary } = require('cloudinary');
      await cloudinary.uploader.destroy(this.groupImage.publicId);
    }
    next();
  } catch (error) {
    next(error);
  }
});

const Chat = mongoose.model('Chat', chatSchema);

export default Chat;
