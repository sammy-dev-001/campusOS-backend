import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Notification must belong to a user']
  },
  title: {
    type: String,
    required: [true, 'Notification must have a title'],
    trim: true,
    maxlength: [100, 'Title must be less than 100 characters']
  },
  message: {
    type: String,
    required: [true, 'Notification must have a message'],
    trim: true,
    maxlength: [500, 'Message must be less than 500 characters']
  },
  type: {
    type: String,
    enum: {
      values: ['info', 'success', 'warning', 'error', 'announcement', 'message', 'event', 'document'],
      message: 'Type must be one of: info, success, warning, error, announcement, message, event, document'
    },
    default: 'info'
  },
  read: {
    type: Boolean,
    default: false
  },
  action: {
    type: {
      type: String,
      enum: ['navigate', 'url', 'none'],
      default: 'none'
    },
    target: String,
    params: mongoose.Schema.Types.Mixed
  },
  relatedDocument: {
    type: mongoose.Schema.ObjectId,
    refPath: 'relatedDocumentModel'
  },
  relatedDocumentModel: {
    type: String,
    enum: ['Document', 'Event', 'Post', 'User']
  },
  expiresAt: {
    type: Date,
    default: () => new Date(+new Date() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 0 }); // TTL index for auto-expiration

// Static method to create a notification for multiple users
notificationSchema.statics.createForUsers = async function(userIds, notificationData) {
  const notifications = userIds.map(userId => ({
    ...notificationData,
    user: userId
  }));
  
  return this.create(notifications);
};

// Static method to mark all notifications as read
notificationSchema.statics.markAllAsRead = async function(userId) {
  return this.updateMany(
    { user: userId, read: false },
    { $set: { read: true } }
  );
};

// Instance method to mark as read
notificationSchema.methods.markAsRead = async function() {
  if (this.read) return this;
  
  this.read = true;
  return this.save();
};

// Pre-save hook to handle related document population
notificationSchema.pre(/^find/, function(next) {
  this.populate({
    path: 'user',
    select: 'username displayName profilePicture'
  }).populate({
    path: 'relatedDocument',
    select: 'title name subject content',
    options: { strictPopulate: false }
  });
  
  next();
});

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
