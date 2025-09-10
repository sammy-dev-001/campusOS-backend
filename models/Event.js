import mongoose from 'mongoose';

const attendeeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['going', 'interested', 'not_going'],
    default: 'interested'
  },
  registeredAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date
  },
  location: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    trim: true
  },
  imageUrl: {
    type: String,
    trim: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  attendees: [attendeeSchema]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
eventSchema.index({ startDate: 1 });
eventSchema.index({ createdBy: 1 });

// Virtual for getting the number of attendees
eventSchema.virtual('attendeesCount').get(function() {
  return this.attendees.length;
});

// Static method to get events with filters
eventSchema.statics.getEvents = async function(filters = {}) {
  const { 
    category, 
    isFeatured, 
    startDate, 
    endDate, 
    limit = 20, 
    page = 1 
  } = filters;

  const query = {};
  
  if (category) {
    query.category = category;
  }
  
  if (isFeatured !== undefined) {
    query.isFeatured = isFeatured;
  }
  
  if (startDate) {
    query.startDate = { $gte: new Date(startDate) };
  }
  
  if (endDate) {
    query.endDate = query.endDate || {};
    query.endDate.$lte = new Date(endDate);
  }

  const skip = (page - 1) * limit;

  const [events, total] = await Promise.all([
    this.find(query)
      .sort({ startDate: 1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'username displayName profilePicture')
      .populate('attendees.user', 'username displayName profilePicture'),
    this.countDocuments(query)
  ]);

  return {
    events,
    total,
    page: parseInt(page),
    totalPages: Math.ceil(total / limit)
  };
};

// Instance method to add or update attendee
eventSchema.methods.updateAttendee = async function(userId, status) {
  const attendeeIndex = this.attendees.findIndex(
    attendee => attendee.user.toString() === userId.toString()
  );

  if (attendeeIndex >= 0) {
    this.attendees[attendeeIndex].status = status;
  } else {
    this.attendees.push({ user: userId, status });
  }

  await this.save();
  return this.attendees.find(
    attendee => attendee.user.toString() === userId.toString()
  );
};

// Pre-save hook to ensure endDate is after startDate
eventSchema.pre('save', function(next) {
  if (this.endDate && this.endDate < this.startDate) {
    throw new Error('End date must be after start date');
  }
  next();
});

const Event = mongoose.model('Event', eventSchema);

export default Event;
