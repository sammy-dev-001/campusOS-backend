import mongoose from 'mongoose';

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Group name is required'],
    trim: true,
    minlength: [3, 'Group name must be at least 3 characters'],
    maxlength: [100, 'Group name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['admin', 'moderator', 'member'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isPublic: {
    type: Boolean,
    default: true
  },
  coverPhoto: {
    type: String,
    default: ''
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [30, 'Tag cannot exceed 30 characters']
  }],
  memberCount: {
    type: Number,
    default: 1, // At least the creator is a member
    min: [1, 'Member count cannot be less than 1']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  settings: {
    joinRequest: {
      type: String,
      enum: ['open', 'approval', 'closed'],
      default: 'open'
    },
    postPermissions: {
      type: String,
      enum: ['all', 'moderators', 'admins'],
      default: 'all'
    },
    commentPermissions: {
      type: String,
      enum: ['all', 'members', 'moderators', 'admins'],
      default: 'all'
    }
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
groupSchema.index({ name: 'text', description: 'text', tags: 'text' });
groupSchema.index({ 'members.user': 1 });
groupSchema.index({ isPublic: 1, isActive: 1 });

// Virtual for posts
groupSchema.virtual('posts', {
  ref: 'Post',
  localField: '_id',
  foreignField: 'group',
  justOne: false
});

// Virtual for events
groupSchema.virtual('events', {
  ref: 'Event',
  localField: '_id',
  foreignField: 'group',
  justOne: false
});

// Virtual for polls
groupSchema.virtual('polls', {
  ref: 'Poll',
  localField: '_id',
  foreignField: 'groupId',
  justOne: false
});

// Pre-save hook to update member count
groupSchema.pre('save', function(next) {
  if (this.isModified('members')) {
    this.memberCount = this.members.length;
  }
  next();
});

// Method to check if a user is a member of the group
groupSchema.methods.isMember = function(userId) {
  return this.members.some(member => 
    member.user.toString() === userId.toString()
  );
};

// Method to check if a user is an admin of the group
groupSchema.methods.isAdmin = function(userId) {
  return this.members.some(member => 
    member.user.toString() === userId.toString() && 
    (member.role === 'admin' || member.role === 'moderator')
  );
};

// Method to add a member to the group
groupSchema.methods.addMember = async function(userId, role = 'member') {
  const existingMember = this.members.find(member => 
    member.user.toString() === userId.toString()
  );

  if (existingMember) {
    // Update existing member's role if different
    if (existingMember.role !== role) {
      existingMember.role = role;
      await this.save();
    }
    return this;
  }

  // Add new member
  this.members.push({
    user: userId,
    role
  });

  return this.save();
};

// Method to remove a member from the group
groupSchema.methods.removeMember = async function(userId) {
  const initialLength = this.members.length;
  this.members = this.members.filter(
    member => member.user.toString() !== userId.toString()
  );
  
  if (this.members.length !== initialLength) {
    await this.save();
  }
  
  return this;
};

// Static method to get groups with pagination and filtering
groupSchema.statics.paginate = async function(filter, options) {
  const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = options;
  const skip = (page - 1) * limit;
  
  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
  
  const [total, groups] = await Promise.all([
    this.countDocuments(filter),
    this.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'name email avatar')
      .populate('members.user', 'name email avatar')
  ]);
  
  const totalPages = Math.ceil(total / limit);
  
  return {
    total,
    totalPages,
    currentPage: page,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    groups
  };
};

const Group = mongoose.model('Group', groupSchema);

export default Group;
