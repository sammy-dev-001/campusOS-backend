import mongoose from 'mongoose';

const timetableSchema = new mongoose.Schema({
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: [true, 'Course reference is required']
  },
  tutor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tutor',
    required: [true, 'Tutor reference is required']
  },
  dayOfWeek: {
    type: String,
    required: [true, 'Day of week is required'],
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  },
  startTime: {
    type: String,
    required: [true, 'Start time is required'],
    match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/ // HH:MM format
  },
  endTime: {
    type: String,
    required: [true, 'End time is required'],
    match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/ // HH:MM format
    
  },
  location: {
    type: String,
    trim: true,
    maxlength: [100, 'Location cannot exceed 100 characters']
  },
  room: {
    type: String,
    trim: true
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  meetingLink: {
    type: String,
    trim: true
  },
  recurring: {
    type: Boolean,
    default: true
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date
  },
  exceptions: [{
    date: Date,
    reason: String,
    isCancelled: Boolean,
    alternativeDate: Date
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator reference is required']
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
timetableSchema.index({ course: 1 });
timetableSchema.index({ tutor: 1 });
timetableSchema.index({ dayOfWeek: 1, startTime: 1 });
timetableSchema.index({ startDate: 1, endDate: 1 });

// Virtual for duration (in minutes)
timetableSchema.virtual('duration').get(function() {
  const [startH, startM] = this.startTime.split(':').map(Number);
  const [endH, endM] = this.endTime.split(':').map(Number);
  return (endH * 60 + endM) - (startH * 60 + startM);
});

// Pre-save hook to validate time
const validateTime = function(next) {
  const [startH, startM] = this.startTime.split(':').map(Number);
  const [endH, endM] = this.endTime.split(':').map(Number);
  
  if (startH > endH || (startH === endH && startM >= endM)) {
    next(new Error('End time must be after start time'));
    return;
  }
  
  next();
};

timetableSchema.pre('save', validateTime);

const Timetable = mongoose.model('Timetable', timetableSchema);

export default Timetable;
