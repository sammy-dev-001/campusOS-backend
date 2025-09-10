import mongoose from 'mongoose';

const postSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  media: [{
    url: String,
    mediaType: {
      type: String,
      enum: ['image', 'video', 'document'],
      default: 'image'
    },
    publicId: String // Cloudinary public ID
  }],
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  comments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  }],
  isPinned: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String,
    trim: true
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
    name: String
  },
  privacy: {
    type: String,
    enum: ['public', 'friends', 'private'],
    default: 'public'
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

// Indexes
postSchema.index({ author: 1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ 'location.coordinates': '2dsphere' });

// Virtual for comment count
postSchema.virtual('commentCount').get(function() {
  return this.comments ? this.comments.length : 0;
});

// Virtual for like count
postSchema.virtual('likeCount').get(function() {
  return this.likes ? this.likes.length : 0;
});

// Pre-remove hook to delete associated media from Cloudinary
postSchema.pre('remove', async function(next) {
  try {
    if (this.media && this.media.length > 0) {
      const { cloudinary } = require('cloudinary');
      const deletePromises = this.media.map(media => 
        cloudinary.uploader.destroy(media.publicId)
      );
      await Promise.all(deletePromises);
    }
    next();
  } catch (error) {
    next(error);
  }
});

const Post = mongoose.model('Post', postSchema);

export default Post;
