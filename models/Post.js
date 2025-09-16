import mongoose from 'mongoose';
import mongooseKeywords from 'mongoose-keywords';
import { toJSON, paginate } from './plugins/index.js';

const postSchema = new mongoose.Schema({
  content: {
    type: String,
    trim: true,
    maxlength: [5000, 'Post content cannot exceed 5000 characters']
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Author is required'],
    index: true
  },
  originalPost: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    default: null
  },
  isRepost: {
    type: Boolean,
    default: false
  },
  repostCount: {
    type: Number,
    default: 0
  },
  repostedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  media: [{
    url: {
      type: String,
      required: [true, 'Media URL is required']
    },
    mediaType: {
      type: String,
      enum: ['image', 'video', 'document', 'audio', 'gif'],
      required: [true, 'Media type is required']
    },
    publicId: String, // Cloudinary public ID
    width: Number,
    height: Number,
    duration: Number, // For videos/audio
    thumbnail: String, // For video thumbnails
    altText: {
      type: String,
      maxlength: [500, 'Alt text cannot exceed 500 characters']
    },
    _id: false
  }],
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
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  likeCount: {
    type: Number,
    default: 0
  },
  comments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  }],
  commentCount: {
    type: Number,
    default: 0
  },
  shares: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  shareCount: {
    type: Number,
    default: 0
  },
  saves: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  saveCount: {
    type: Number,
    default: 0
  },
  views: {
    type: Number,
    default: 0
  },
  viewers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isPinned: {
    type: Boolean,
    default: false
  },
  pinnedAt: Date,
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
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: '2dsphere'
    },
    name: String,
    placeId: String
  },
  privacy: {
    type: String,
    enum: ['public', 'connections', 'private'],
    default: 'public'
  },
  allowComments: {
    type: Boolean,
    default: true
  },
  allowSharing: {
    type: Boolean,
    default: true
  },
  isSensitive: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived', 'deleted'],
    default: 'published'
  },
  scheduledAt: {
    type: Date,
    default: null
  },
  publishedAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    default: null
  },
  stats: {
    reach: {
      type: Number,
      default: 0
    },
    engagement: {
      type: Number,
      default: 0
    },
    clicks: {
      type: Number,
      default: 0
    },
    _id: false
  },
  metadata: {
    client: String, // Web, iOS, Android, etc.
    ipAddress: String,
    userAgent: String,
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
  }
});

// Add plugins
postSchema.plugin(toJSON);
postSchema.plugin(paginate);

// Only include fields that exist in the schema
const keywordPaths = ['content'];
if (postSchema.path('tags')) keywordPaths.push('tags');
if (postSchema.path('hashtags')) keywordPaths.push('hashtags');

postSchema.plugin(mongooseKeywords, { paths: keywordPaths });

// Indexes
postSchema.index({ author: 1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ 'location.coordinates': '2dsphere' });
postSchema.index({ 'mentions.user': 1 });
postSchema.index({ hashtags: 1 });
postSchema.index({ status: 1, scheduledAt: 1 });

// Pre-save hook to update counters and timestamps
postSchema.pre('save', function(next) {
  // Update counters
  this.likeCount = this.likes ? this.likes.length : 0;
  this.commentCount = this.comments ? this.comments.length : 0;
  this.shareCount = this.shares ? this.shares.length : 0;
  this.saveCount = this.saves ? this.saves.length : 0;
  
  // Set publishedAt if not set and status is published
  if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  
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
  
  next();
});

// Pre-remove hook to clean up related data
postSchema.pre('remove', { document: true, query: false }, async function(next) {
  try {
    // Delete associated media from Cloudinary
    if (this.media && this.media.length > 0) {
      const { v2: cloudinary } = await import('cloudinary');
      const deletePromises = this.media
        .filter(media => media.publicId)
        .map(media => cloudinary.uploader.destroy(media.publicId));
      
      await Promise.all(deletePromises);
    }
    
    // Clean up related data (comments, notifications, etc.)
    const Comment = this.model('Comment');
    const Notification = this.model('Notification');
    
    await Promise.all([
      Comment.deleteMany({ post: this._id }),
      Notification.deleteMany({ 'data.post': this._id })
    ]);
    
    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
postSchema.methods = {
  // Add a like to the post
  async addLike(userId) {
    if (!this.likes.includes(userId)) {
      this.likes.push(userId);
      this.likeCount += 1;
      await this.save();
      return true;
    }
    return false;
  },
  
  // Remove a like from the post
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
  
  // Increment view count
  async incrementView(userId) {
    // Only increment if user hasn't viewed the post yet
    if (!this.viewers.includes(userId)) {
      this.viewers.push(userId);
      this.views += 1;
      await this.save();
    }
    return this.views;
  },
  
  // Check if user has liked the post
  isLikedBy(userId) {
    return this.likes.some(id => id.equals(userId));
  },
  
  // Check if user has saved the post
  isSavedBy(userId) {
    return this.saves.some(id => id.equals(userId));
  }
};

// Static methods
postSchema.statics = {
  // Get feed posts for a user
  async getFeed(userId, options = {}) {
    const { page = 1, limit = 10 } = options;
    const skip = (page - 1) * limit;
    
    // In a real app, you'd get the user's connections/following here
    // For now, we'll just get the latest public posts
    const query = {
      status: 'published',
      privacy: 'public',
      $or: [
        { scheduledAt: { $lte: new Date() } },
        { scheduledAt: { $exists: false } }
      ]
    };
    
    const [posts, total] = await Promise.all([
      this.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('author', 'username profilePic fullName')
        .lean(),
      this.countDocuments(query)
    ]);
    
    return {
      data: posts,
      meta: {
        total,
        page,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1
      }
    };
  },
  
  // Get trending posts
  async getTrending(options = {}) {
    const { limit = 10, timeRange = 'week' } = options;
    const now = new Date();
    let startDate;
    
    switch (timeRange) {
      case 'day':
        startDate = new Date(now.setDate(now.getDate() - 1));
        break;
      case 'month':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case 'year':
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      case 'week':
      default:
        startDate = new Date(now.setDate(now.getDate() - 7));
    }
    
    return this.aggregate([
      {
        $match: {
          status: 'published',
          privacy: 'public',
          publishedAt: { $gte: startDate },
          $or: [
            { scheduledAt: { $lte: new Date() } },
            { scheduledAt: { $exists: false } }
          ]
        }
      },
      {
        $addFields: {
          // Simple engagement score (adjust weights as needed)
          engagementScore: {
            $add: [
              { $size: '$likes' },
              { $multiply: [{ $size: '$comments' }, 2] },
              { $multiply: ['$shares', 3] },
              { $multiply: [{ $ifNull: ['$views', 0] }, 0.1] }
            ]
          },
          // Time decay factor (newer posts get a boost)
          timeDecay: {
            $divide: [
              { $subtract: [new Date(), '$publishedAt'] },
              1000 * 60 * 60 // Convert to hours
            ]
          }
        }
      },
      {
        $addFields: {
          // Combine engagement and time decay (adjust formula as needed)
          score: {
            $divide: [
              '$engagementScore',
              { $pow: [{ $add: ['$timeDecay', 1] }, 1.5] }
            ]
          }
        }
      },
      { $sort: { score: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'users',
          localField: 'author',
          foreignField: '_id',
          as: 'author'
        }
      },
      { $unwind: '$author' },
      {
        $project: {
          'author.password': 0,
          'author.email': 0,
          'author.__v': 0
        }
      }
    ]);
  }
};

// Text search index
postSchema.index({
  content: 'text',
  'hashtags': 'text',
  'mentions.user.username': 'text'
}, {
  weights: {
    content: 10,
    'hashtags': 5,
    'mentions.user.username': 1
  },
  name: 'post_text_search'
});

const Post = mongoose.model('Post', postSchema);

export default Post;
