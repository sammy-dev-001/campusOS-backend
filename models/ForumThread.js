import mongoose from 'mongoose';

const forumThreadSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 200
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: String,
    enum: ['general', 'questions', 'announcements', 'discussions'],
    default: 'general'
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  isLocked: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String,
    trim: true
  }],
  viewCount: {
    type: Number,
    default: 0
  },
  lastActivity: {
    type: Date,
    default: Date.now
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

// Add text index for search
forumThreadSchema.index({
  title: 'text',
  content: 'text',
  tags: 'text'
}, {
  weights: {
    title: 5,
    tags: 3,
    content: 1
  }
});

// Virtual for comments
forumThreadSchema.virtual('comments', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'thread',
  justOne: false
});

// Virtual for subscriptions
forumThreadSchema.virtual('subscriptions', {
  ref: 'ForumSubscription',
  localField: '_id',
  foreignField: 'thread',
  justOne: false
});

// Update lastActivity when comments are added
forumThreadSchema.pre('save', function(next) {
  if (this.isModified('comments') || this.isNew) {
    this.lastActivity = new Date();
  }
  next();
});

// Cascade delete comments when a thread is deleted
forumThreadSchema.pre('remove', async function(next) {
  await this.model('Comment').deleteMany({ thread: this._id });
  await this.model('ForumSubscription').deleteMany({ thread: this._id });
  next();
});

// Static method to get threads with pagination and filtering
forumThreadSchema.statics.paginate = async function(filter, options) {
  const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = options;
  const skip = (page - 1) * limit;
  
  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
  
  const [total, threads] = await Promise.all([
    this.countDocuments(filter),
    this.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('author', 'name email avatar')
      .populate({
        path: 'comments',
        options: { sort: { createdAt: -1 }, limit: 1 },
        populate: { path: 'author', select: 'name email avatar' }
      })
  ]);
  
  const totalPages = Math.ceil(total / limit);
  
  return {
    total,
    totalPages,
    currentPage: page,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    threads
  };
};

const ForumThread = mongoose.model('ForumThread', forumThreadSchema);

export default ForumThread;
