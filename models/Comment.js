import mongoose from 'mongoose';
import mongooseKeywords from 'mongoose-keywords';
import { toJSON, paginate } from './plugins/index.js';

const commentSchema = new mongoose.Schema({
  content: {
    type: String,
    required: [true, 'Comment content is required'],
    trim: true,
    maxlength: [2000, 'Comment cannot exceed 2000 characters']
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Author is required'],
    index: true
  },
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: [true, 'Post reference is required'],
    index: true
  },
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null
  },
  replies: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  }],
  replyCount: {
    type: Number,
    default: 0
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  likeCount: {
    type: Number,
    default: 0
  },
  mentions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    indices: [Number], // [startIndex, endIndex] in content
    _id: false
  }],
  hashtags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  isEdited: {
    type: Boolean,
    default: false
  },
  editHistory: [{
    content: String,
    editedAt: {
      type: Date,
      default: Date.now
    },
    _id: false
  }],
  media: [{
    url: {
      type: String,
      required: [true, 'Media URL is required']
    },
    mediaType: {
      type: String,
      enum: ['image', 'video', 'gif'],
      required: [true, 'Media type is required']
    },
    publicId: String, // Cloudinary public ID
    width: Number,
    height: Number,
    duration: Number, // For videos
    thumbnail: String, // For video thumbnails
    altText: {
      type: String,
      maxlength: [500, 'Alt text cannot exceed 500 characters']
    },
    _id: false
  }],
  isPinned: {
    type: Boolean,
    default: false
  },
  pinnedAt: Date,
  status: {
    type: String,
    enum: ['active', 'deleted', 'flagged'],
    default: 'active'
  },
  metadata: {
    ipAddress: String,
    userAgent: String,
    client: String, // Web, iOS, Android, etc.
    _id: false
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    virtuals: true
  }
});

// Add plugins
commentSchema.plugin(toJSON);
commentSchema.plugin(paginate);
commentSchema.plugin(mongooseKeywords, { paths: ['content', 'hashtags'] });

// Indexes
commentSchema.index({ post: 1, createdAt: -1 });
commentSchema.index({ author: 1, createdAt: -1 });
commentSchema.index({ parentComment: 1, createdAt: 1 });
commentSchema.index({ 'mentions.user': 1 });
commentSchema.index({ hashtags: 1 });

// Text search index
commentSchema.index({
  content: 'text',
  'hashtags': 'text',
  'mentions.user.username': 'text'
}, {
  weights: {
    content: 10,
    'hashtags': 5,
    'mentions.user.username': 1
  },
  name: 'comment_text_search'
});

// Pre-save hook to update counters and timestamps
commentSchema.pre('save', function(next) {
  // Update counters
  this.likeCount = this.likes ? this.likes.length : 0;
  this.replyCount = this.replies ? this.replies.length : 0;
  
  // Track edit history if content changed
  if (this.isModified('content') && !this.isNew) {
    if (!this.editHistory) {
      this.editHistory = [];
    }
    this.editHistory.unshift({
      content: this.content,
      editedAt: new Date()
    });
    this.isEdited = true;
  }
  
  // Set pinnedAt timestamp if comment is pinned
  if (this.isModified('isPinned') && this.isPinned) {
    this.pinnedAt = new Date();
  }
  
  next();
});

// Pre-remove hook to clean up related data
commentSchema.pre('remove', { document: true, query: false }, async function(next) {
  try {
    // Delete associated media from Cloudinary
    if (this.media && this.media.length > 0) {
      const { v2: cloudinary } = await import('cloudinary');
      const deletePromises = this.media
        .filter(media => media.publicId)
        .map(media => cloudinary.uploader.destroy(media.publicId));
      
      await Promise.all(deletePromises);
    }
    
    // If this is a top-level comment, update the post's comment count
    if (!this.parentComment) {
      await this.model('Post').updateOne(
        { _id: this.post },
        { $pull: { comments: this._id } }
      );
    } else {
      // If this is a reply, update the parent comment's replies
      await this.model('Comment').updateOne(
        { _id: this.parentComment },
        { $pull: { replies: this._id } }
      );
    }
    
    // Delete all replies to this comment
    if (this.replies && this.replies.length > 0) {
      await this.model('Comment').deleteMany({ _id: { $in: this.replies } });
    }
    
    // Clean up likes and notifications
    const Notification = this.model('Notification');
    await Promise.all([
      Notification.deleteMany({ 'data.comment': this._id })
    ]);
    
    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
commentSchema.methods = {
  // Add a like to the comment
  async addLike(userId) {
    if (!this.likes.includes(userId)) {
      this.likes.push(userId);
      this.likeCount += 1;
      await this.save();
      return true;
    }
    return false;
  },
  
  // Remove a like from the comment
  async removeLike(userId) {
    const index = this.likes.indexOf(userId);
    if (index > -1) {
      this.likes.splice(index, 1);
      this.likeCount = Math.max(0, this.likeCount - 1);
      await this.save();
      return true;
    }
    return false;
  },
  
  // Add a reply to the comment
  async addReply(commentId) {
    if (!this.replies.includes(commentId)) {
      this.replies.push(commentId);
      this.replyCount += 1;
      await this.save();
      return true;
    }
    return false;
  },
  
  // Remove a reply from the comment
  async removeReply(commentId) {
    const index = this.replies.indexOf(commentId);
    if (index > -1) {
      this.replies.splice(index, 1);
      this.replyCount = Math.max(0, this.replyCount - 1);
      await this.save();
      return true;
    }
    return false;
  },
  
  // Check if user has liked the comment
  isLikedBy(userId) {
    return this.likes.some(id => id.equals(userId));
  },
  
  // Toggle like status for a user
  async toggleLike(userId) {
    if (this.isLikedBy(userId)) {
      return await this.removeLike(userId);
    } else {
      return await this.addLike(userId);
    }
  }
};

// Static methods
commentSchema.statics = {
  // Get comments for a post with pagination
  async getCommentsForPost(postId, options = {}) {
    const { 
      page = 1, 
      limit = 10, 
      sortBy = 'newest',
      includeReplies = false
    } = options;
    
    const skip = (page - 1) * limit;
    
    // Build sort criteria
    let sortCriteria = {};
    switch (sortBy) {
      case 'oldest':
        sortCriteria = { createdAt: 1 };
        break;
      case 'mostLiked':
        sortCriteria = { likeCount: -1, createdAt: -1 };
        break;
      case 'newest':
      default:
        sortCriteria = { createdAt: -1 };
    }
    
    // Build query
    const query = {
      post: postId,
      parentComment: { $exists: false },
      status: 'active'
    };
    
    const [comments, total] = await Promise.all([
      this.find(query)
        .sort(sortCriteria)
        .skip(skip)
        .limit(limit)
        .populate('author', 'username profilePic fullName')
        .populate({
          path: 'replies',
          options: { 
            sort: { createdAt: 1 },
            limit: includeReplies ? 5 : 0 // Limit number of replies to include
          },
          populate: {
            path: 'author',
            select: 'username profilePic fullName'
          }
        })
        .lean(),
      this.countDocuments(query)
    ]);
    
    return {
      data: comments,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1
      }
    };
  },
  
  // Get replies for a comment with pagination
  async getReplies(commentId, options = {}) {
    const { page = 1, limit = 10, sortBy = 'newest' } = options;
    const skip = (page - 1) * limit;
    
    // Build sort criteria
    let sortCriteria = {};
    switch (sortBy) {
      case 'oldest':
        sortCriteria = { createdAt: 1 };
        break;
      case 'mostLiked':
        sortCriteria = { likeCount: -1, createdAt: -1 };
        break;
      case 'newest':
      default:
        sortCriteria = { createdAt: -1 };
    }
    
    const query = {
      parentComment: commentId,
      status: 'active'
    };
    
    const [replies, total] = await Promise.all([
      this.find(query)
        .sort(sortCriteria)
        .skip(skip)
        .limit(limit)
        .populate('author', 'username profilePic fullName')
        .lean(),
      this.countDocuments(query)
    ]);
    
    return {
      data: replies,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1
      }
    };
  }
};

const Comment = mongoose.model('Comment', commentSchema);

export default Comment;
