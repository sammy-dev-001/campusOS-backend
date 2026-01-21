/**
 * Study Buddy Request Model
 * Handles buddy requests between users
 */
import mongoose from 'mongoose';

const studyBuddyRequestSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },

    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },

    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected', 'cancelled'],
        default: 'pending',
    },

    message: {
        type: String,
        maxlength: 300,
    },

    matchScore: {
        type: Number,
        min: 0,
        max: 100,
    },

    // Shared subjects that prompted this match
    sharedSubjects: [{
        courseCode: String,
        name: String,
        _id: false,
    }],

    respondedAt: Date,

}, { timestamps: true });

// Compound index to prevent duplicate requests
studyBuddyRequestSchema.index({ sender: 1, receiver: 1 }, { unique: true });
studyBuddyRequestSchema.index({ receiver: 1, status: 1 });
studyBuddyRequestSchema.index({ sender: 1, status: 1 });

const StudyBuddyRequest = mongoose.model('StudyBuddyRequest', studyBuddyRequestSchema);

export default StudyBuddyRequest;
