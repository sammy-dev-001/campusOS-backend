/**
 * Study Buddy Model
 * Stores user study preferences for matching
 */
import mongoose from 'mongoose';

const studyBuddySchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
    },

    // Study preferences
    studyStyle: {
        type: String,
        enum: ['solo_focused', 'quiet_group', 'discussion_based', 'mixed'],
        default: 'mixed',
    },

    preferredGroupSize: {
        type: String,
        enum: ['one_on_one', 'small_group', 'large_group', 'any'],
        default: 'any',
    },

    preferredEnvironment: {
        type: String,
        enum: ['library', 'cafe', 'online', 'classroom', 'anywhere'],
        default: 'anywhere',
    },

    // Availability
    availability: [{
        day: {
            type: Number, // 0 = Sunday, 1 = Monday, etc.
            min: 0,
            max: 6,
        },
        startTime: String, // "09:00"
        endTime: String,   // "17:00"
        _id: false,
    }],

    // Subjects/Courses
    subjects: [{
        name: String,
        courseCode: String,
        level: {
            type: String,
            enum: ['beginner', 'intermediate', 'advanced'],
        },
        needHelp: Boolean,
        canHelp: Boolean,
        _id: false,
    }],

    // Academic info
    major: String,
    year: {
        type: String,
        enum: ['freshman', 'sophomore', 'junior', 'senior', 'graduate', 'other'],
    },

    // Matching settings
    isActive: {
        type: Boolean,
        default: true,
    },

    lastActive: {
        type: Date,
        default: Date.now,
    },

    // Bio/description
    bio: {
        type: String,
        maxlength: 500,
    },

    // Goals
    studyGoals: [{
        type: String,
        maxlength: 100,
        _id: false,
    }],

}, { timestamps: true });

// Index for efficient matching queries
studyBuddySchema.index({ 'subjects.courseCode': 1 });
studyBuddySchema.index({ major: 1 });
studyBuddySchema.index({ isActive: 1 });
studyBuddySchema.index({ 'availability.day': 1 });

const StudyBuddy = mongoose.model('StudyBuddy', studyBuddySchema);

export default StudyBuddy;
