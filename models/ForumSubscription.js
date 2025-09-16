import mongoose from 'mongoose';

const forumSubscriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  thread: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ForumThread',
    required: true,
    index: true
  },
  notificationPreferences: {
    email: {
      type: Boolean,
      default: true
    },
    push: {
      type: Boolean,
      default: true
    }
  },
  lastNotified: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound index to ensure one subscription per user per thread
forumSubscriptionSchema.index(
  { user: 1, thread: 1 },
  { unique: true }
);

// Add a static method to subscribe a user to a thread
forumSubscriptionSchema.statics.subscribe = async function(userId, threadId, preferences = {}) {
  const existingSubscription = await this.findOne({ user: userId, thread: threadId });
  
  if (existingSubscription) {
    // Update existing subscription
    existingSubscription.notificationPreferences = {
      ...existingSubscription.notificationPreferences,
      ...preferences
    };
    existingSubscription.isActive = true;
    return existingSubscription.save();
  }
  
  // Create new subscription
  return this.create({
    user: userId,
    thread: threadId,
    notificationPreferences: {
      email: true,
      push: true,
      ...preferences
    }
  });
};

// Add a static method to unsubscribe a user from a thread
forumSubscriptionSchema.statics.unsubscribe = async function(userId, threadId) {
  return this.findOneAndUpdate(
    { user: userId, thread: threadId },
    { isActive: false },
    { new: true }
  );
};

// Add a method to update notification timestamp
forumSubscriptionSchema.methods.updateNotificationTime = function() {
  this.lastNotified = new Date();
  return this.save();
};

// Pre-save hook to validate user and thread existence
forumSubscriptionSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('user') || this.isModified('thread')) {
    const [userExists, threadExists] = await Promise.all([
      mongoose.model('User').exists({ _id: this.user }),
      mongoose.model('ForumThread').exists({ _id: this.thread })
    ]);
    
    if (!userExists) {
      throw new Error('User does not exist');
    }
    
    if (!threadExists) {
      throw new Error('Thread does not exist');
    }
  }
  
  next();
});

const ForumSubscription = mongoose.model('ForumSubscription', forumSubscriptionSchema);

export default ForumSubscription;
