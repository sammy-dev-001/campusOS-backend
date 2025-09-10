import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'A document must have a title'],
    trim: true,
    maxlength: [100, 'A document title must have less or equal than 100 characters'],
    minlength: [3, 'A document title must have more or equal than 3 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'A document description must have less or equal than 500 characters']
  },
  fileUrl: {
    type: String,
    required: [true, 'A document must have a file URL']
  },
  fileType: {
    type: String,
    required: [true, 'A document must have a file type'],
    enum: {
      values: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'image', 'video', 'audio', 'archive', 'other'],
      message: 'File type must be one of: pdf, doc, docx, ppt, pptx, xls, xlsx, txt, image, video, audio, archive, other'
    }
  },
  fileSize: {
    type: Number,
    required: [true, 'A document must have a file size']
  },
  mimeType: {
    type: String,
    required: [true, 'A document must have a MIME type']
  },
  thumbnailUrl: {
    type: String
  },
  createdBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'A document must belong to a user']
  },
  course: {
    type: mongoose.Schema.ObjectId,
    ref: 'Course',
    required: [true, 'A document must belong to a course']
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [30, 'A tag must have less or equal than 30 characters']
  }],
  isPublic: {
    type: Boolean,
    default: false
  },
  downloadCount: {
    type: Number,
    default: 0
  },
  viewCount: {
    type: Number,
    default: 0
  },
  version: {
    type: Number,
    default: 1
  },
  parentDocument: {
    type: mongoose.Schema.ObjectId,
    ref: 'Document'
  },
  isCurrentVersion: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
documentSchema.index({ title: 'text', description: 'text', tags: 'text' });
documentSchema.index({ createdBy: 1 });
documentSchema.index({ course: 1 });
documentSchema.index({ isPublic: 1 });

// Virtual populate for versions
documentSchema.virtual('versions', {
  ref: 'Document',
  foreignField: 'parentDocument',
  localField: '_id'
});

// Virtual for getting the number of versions
documentSchema.virtual('versionCount').get(function() {
  return this.versions ? this.versions.length + 1 : 1;
});

// Static method to get document statistics
documentSchema.statics.getStats = async function(courseId) {
  const stats = await this.aggregate([
    {
      $match: { course: courseId, isCurrentVersion: true }
    },
    {
      $group: {
        _id: '$fileType',
        count: { $sum: 1 },
        totalSize: { $sum: '$fileSize' },
        avgSize: { $avg: '$fileSize' },
        minSize: { $min: '$fileSize' },
        maxSize: { $max: '$fileSize' }
      }
    },
    {
      $addFields: { fileType: '$_id' }
    },
    {
      $project: { _id: 0 }
    },
    {
      $sort: { count: -1 }
    }
  ]);

  return stats;
};

// Document middleware to handle versioning
documentSchema.pre('save', async function(next) {
  // Only run this function if isCurrentVersion was modified
  if (this.isModified('isCurrentVersion') && this.isCurrentVersion === false) {
    // Find all versions of this document and set isCurrentVersion to false
    await this.constructor.updateMany(
      { parentDocument: this.parentDocument || this._id },
      { $set: { isCurrentVersion: false } }
    );
  }
  next();
});

// Query middleware to only show current versions by default
documentSchema.pre(/^find/, function(next) {
  this.find({ isCurrentVersion: true });
  next();
});

// Query middleware to populate createdBy and course fields
documentSchema.pre(/^find/, function(next) {
  this.populate({
    path: 'createdBy',
    select: 'username displayName profilePicture'
  }).populate({
    path: 'course',
    select: 'name code'
  });
  
  next();
});

// Instance method to create a new version of the document
documentSchema.methods.createNewVersion = async function(fileData) {
  const newVersion = await this.constructor.create({
    ...this.toObject(),
    _id: undefined, // Let MongoDB generate a new ID
    parentDocument: this.parentDocument || this._id,
    isCurrentVersion: true,
    version: this.version + 1,
    fileUrl: fileData.url,
    fileType: fileData.type,
    fileSize: fileData.size,
    mimeType: fileData.mimetype,
    thumbnailUrl: fileData.thumbnailUrl
  });

  // Set the current version to false
  this.isCurrentVersion = false;
  await this.save();

  return newVersion;
};

// Instance method to increment view count
documentSchema.methods.incrementViewCount = async function() {
  this.viewCount += 1;
  await this.save({ validateBeforeSave: false });
};

// Instance method to increment download count
documentSchema.methods.incrementDownloadCount = async function() {
  this.downloadCount += 1;
  await this.save({ validateBeforeSave: false });
};

const Document = mongoose.model('Document', documentSchema);

export default Document;
