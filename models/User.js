import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/, 'Please enter a valid email address']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  firstName: {
    type: String,
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  bio: {
    type: String,
    trim: true,
    maxlength: [500, 'Bio cannot exceed 500 characters']
  },
  groups: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    default: []
  }],
  lastName: {
    type: String,
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  fullName: {
    type: String,
    trim: true
  },
  profilePic: {
    type: String,
    default: ''
  },
  coverPhoto: {
    type: String,
    default: ''
  },
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot exceed 500 characters'],
    default: ''
  },
  phone: {
    type: String,
    trim: true
  },
  dateOfBirth: {
    type: Date
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other', 'prefer-not-to-say'],
    default: 'prefer-not-to-say'
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'deleted'],
    default: 'active'
  },
  role: {
    type: String,
    enum: ['user', 'moderator', 'admin'],
    default: 'user'
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  onlineStatus: {
    type: String,
    enum: ['online', 'offline', 'away', 'busy'],
    default: 'offline'
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  settings: {
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      push: {
        type: Boolean,
        default: true
      },
      messages: {
        type: Boolean,
        default: true
      },
      mentions: {
        type: Boolean,
        default: true
      },
      _id: false
    },
    privacy: {
      profileVisibility: {
        type: String,
        enum: ['public', 'friends', 'private'],
        default: 'public'
      },
      lastSeen: {
        type: String,
        enum: ['everyone', 'my_contacts', 'nobody'],
        default: 'everyone'
      },
      _id: false
    },
    _id: false
  },
  socialLinks: [{
    platform: String,
    url: String,
    _id: false
  }],
  refreshTokens: [{
    token: String,
    userAgent: String,
    ip: String,
    lastUsed: Date,
    _id: false
  }],
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  emailVerificationToken: String,
  emailVerificationExpires: Date
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function (doc, ret) {
      delete ret.password;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true });

// Pre-save hook to set fullName and handle timestamps
userSchema.pre('save', function(next) {
  // Set fullName if first or last name exists
  if (this.isModified('firstName') || this.isModified('lastName')) {
    this.fullName = `${this.firstName || ''} ${this.lastName || ''}`.trim();
  }
  
  // Update timestamps
  const now = new Date();
  if (!this.createdAt) {
    this.createdAt = now;
  }
  this.updatedAt = now;
  
  // Update passwordChangedAt if password was modified
  if (this.isModified('password') && !this.isNew) {
    this.passwordChangedAt = now;
  }
  
  next();
});

// Virtual for user's full name
userSchema.virtual('displayName').get(function() {
  return this.fullName || this.username;
});

// Virtual for user's initials
userSchema.virtual('initials').get(function() {
  if (this.firstName && this.lastName) {
    return `${this.firstName[0]}${this.lastName[0]}`.toUpperCase();
  }
  return this.username.substring(0, 2).toUpperCase();
});

// Method to check if user has a specific role
userSchema.methods.hasRole = function(role) {
  return this.role === role || this.role === 'admin';
};

// Method to create password reset token
userSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  return resetToken;
};

// Method to create email verification token
userSchema.methods.createEmailVerificationToken = function() {
  const verificationToken = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return verificationToken;
};

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword || this.password);
};

// Pre-save hook to hash password
userSchema.pre('save', async function(next) {
  // Only run this function if password was actually modified
  if (!this.isModified('password')) return next();
  
  try {
    // Hash the password with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    
    // Set passwordChangedAt if not a new user
    if (!this.isNew) {
      this.passwordChangedAt = Date.now() - 1000; // 1 second in the past to ensure token is created after
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Method to check if user changed password after the token was issued
userSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10
    );
    return JWTTimestamp < changedTimestamp;
  }
  // False means NOT changed
  return false;
};

const User = mongoose.model('User', userSchema);

export default User;
