import mongoose from 'mongoose';

const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  content: {
    type: String,
    required: [true, 'Content is required'],
    trim: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Author is required']
  },
  targetAudience: {
    type: [{
      type: String,
      enum: ['students', 'staff', 'faculty', 'all']
    }],
    default: ['all']
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  expiryDate: {
    type: Date,
    default: () => new Date(+new Date() + 7*24*60*60*1000) // Default to 1 week from now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
announcementSchema.index({ title: 'text', content: 'text' });
announcementSchema.index({ isPinned: 1, createdAt: -1 });
announcementSchema.index({ expiryDate: 1 }, { expireAfterSeconds: 0 });

const Announcement = mongoose.model('Announcement', announcementSchema);

export default Announcement;
