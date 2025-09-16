import mongoose from 'mongoose';

const optionSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    default: () => new mongoose.Types.ObjectId().toString()
  },
  text: {
    type: String,
    required: [true, 'Option text is required'],
    trim: true,
    minlength: [1, 'Option text must be at least 1 character long'],
    maxlength: [200, 'Option text must be less than 200 characters']
  },
  votes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }]
}, { 
  _id: false,
  versionKey: false
});

const pollSchema = new mongoose.Schema({
  question: {
    type: String,
    required: [true, 'Question is required'],
    trim: true,
    minlength: [3, 'Question must be at least 3 characters long'],
    maxlength: [300, 'Question must be less than 300 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description must be less than 1000 characters']
  },
  options: {
    type: [optionSchema],
    required: [true, 'At least two options are required'],
    validate: {
      validator: function(v) {
        return v.length >= 2 && v.length <= 10; // Limit to 2-10 options
      },
      message: 'A poll must have between 2 and 10 options'
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Poll creator is required']
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    default: null
  },
  isMultipleChoice: {
    type: Boolean,
    default: false
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  expiresAt: {
    type: Date,
    validate: {
      validator: function(v) {
        // If expiration is set, it must be in the future
        if (!v) return true; // No expiration is valid
        return v > new Date();
      },
      message: 'Expiration date must be in the future'
    }
  }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  },
  toObject: { 
    virtuals: true,
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  },
  versionKey: false
});

// Compound index for better query performance
pollSchema.index({ groupId: 1, isActive: 1, createdAt: -1 });
pollSchema.index({ createdBy: 1, isActive: 1 });
pollSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for total votes
pollSchema.virtual('totalVotes').get(function() {
  return this.options.reduce((total, option) => total + option.votes.length, 0);
});

// Check if poll is expired
pollSchema.virtual('isExpired').get(function() {
  return this.expiresAt && this.expiresAt <= new Date();
});

// Update isActive based on expiration
pollSchema.pre('save', function(next) {
  if (this.isModified('expiresAt') || this.isNew) {
    this.isActive = !this.expiresAt || this.expiresAt > new Date();
  }
  next();
});

// Add validation to prevent duplicate options
pollSchema.pre('save', function(next) {
  if (this.isModified('options')) {
    const optionTexts = this.options.map(opt => opt.text.toLowerCase().trim());
    const uniqueOptions = new Set(optionTexts);
    
    if (uniqueOptions.size !== optionTexts.length) {
      return next(new Error('Poll options must be unique'));
    }
  }
  next();
});

// Update isActive before querying
pollSchema.pre('find', function() {
  this.where({ isActive: true });
});

// Add text index for search functionality
pollSchema.index({
  question: 'text',
  description: 'text',
  'options.text': 'text'
}, {
  weights: {
    question: 5,
    description: 1,
    'options.text': 3
  },
  name: 'poll_search_index'
});

// Add a method to check if a user has voted
pollSchema.methods.hasUserVoted = function(userId) {
  if (!userId) return false;
  return this.options.some(option => 
    option.votes.some(voteId => voteId.toString() === userId.toString())
  );
};

// Add a method to get user's vote
pollSchema.methods.getUserVote = function(userId) {
  if (!userId) return null;
  
  for (const option of this.options) {
    const hasVoted = option.votes.some(voteId => voteId.toString() === userId.toString());
    if (hasVoted) {
      return {
        optionId: option.id,
        optionText: option.text,
        votedAt: option.votes.get(userId)?.getTime() || null
      };
    }
  }
  
  return null;
};

const Poll = mongoose.model('Poll', pollSchema);

export default Poll;
