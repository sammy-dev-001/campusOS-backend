/**
 * Study Buddy Routes
 * API endpoints for study buddy matching and requests
 */
import express from 'express';
import { protect } from '../middleware/auth.js';
import StudyBuddy from '../models/StudyBuddy.js';
import StudyBuddyRequest from '../models/StudyBuddyRequest.js';
import User from '../models/User.js';
import { matchingService } from '../services/matchingService.js';
import { NotificationTemplates, sendNotificationToUser } from '../services/pushNotificationService.js';
import AppError from '../utils/appError.js';

const router = express.Router();

// Protect all routes
router.use(protect);

/**
 * @route   GET /api/v1/study-buddy/profile
 * @desc    Get current user's study profile
 * @access  Private
 */
router.get('/profile', async (req, res, next) => {
    try {
        const profile = await StudyBuddy.findOne({ user: req.user.id });

        res.status(200).json({
            status: 'success',
            data: { profile: profile || null },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/v1/study-buddy/profile
 * @desc    Create or update study profile
 * @access  Private
 */
router.post('/profile', async (req, res, next) => {
    try {
        const {
            studyStyle,
            preferredGroupSize,
            preferredEnvironment,
            availability,
            subjects,
            major,
            year,
            bio,
            studyGoals,
            isActive,
        } = req.body;

        const profile = await StudyBuddy.findOneAndUpdate(
            { user: req.user.id },
            {
                user: req.user.id,
                studyStyle,
                preferredGroupSize,
                preferredEnvironment,
                availability,
                subjects,
                major,
                year,
                bio,
                studyGoals,
                isActive: isActive !== undefined ? isActive : true,
                lastActive: new Date(),
            },
            { upsert: true, new: true, runValidators: true }
        );

        res.status(200).json({
            status: 'success',
            data: { profile },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   GET /api/v1/study-buddy/matches
 * @desc    Get matched study buddies
 * @access  Private
 */
router.get('/matches', async (req, res, next) => {
    try {
        const { limit = 20 } = req.query;

        const matches = await matchingService.findMatches(req.user.id, parseInt(limit));

        // Format response
        const formattedMatches = matches.map(match => ({
            id: match.profile.user._id,
            user: match.profile.user,
            matchScore: match.score,
            sharedSubjects: match.sharedSubjects,
            scheduleOverlap: match.scheduleOverlap,
            studyStyle: match.profile.studyStyle,
            preferredEnvironment: match.profile.preferredEnvironment,
            bio: match.profile.bio,
            major: match.profile.major,
            year: match.profile.year,
        }));

        res.status(200).json({
            status: 'success',
            results: formattedMatches.length,
            data: { matches: formattedMatches },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/v1/study-buddy/request/:userId
 * @desc    Send a study buddy request
 * @access  Private
 */
router.post('/request/:userId', async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { message } = req.body;

        if (userId === req.user.id) {
            return next(new AppError('You cannot send a request to yourself', 400));
        }

        // Check if request already exists
        const existingRequest = await StudyBuddyRequest.findOne({
            $or: [
                { sender: req.user.id, receiver: userId },
                { sender: userId, receiver: req.user.id },
            ],
        });

        if (existingRequest) {
            if (existingRequest.status === 'pending') {
                return next(new AppError('A request already exists between you and this user', 400));
            }
            if (existingRequest.status === 'accepted') {
                return next(new AppError('You are already study buddies', 400));
            }
        }

        // Get match details
        const senderProfile = await StudyBuddy.findOne({ user: req.user.id });
        const receiverProfile = await StudyBuddy.findOne({ user: userId });

        let matchScore = 0;
        let sharedSubjects = [];

        if (senderProfile && receiverProfile) {
            matchScore = matchingService.calculateMatchScore(senderProfile, receiverProfile);
            sharedSubjects = matchingService.getSharedSubjects(senderProfile, receiverProfile);
        }

        // Create request
        const request = await StudyBuddyRequest.create({
            sender: req.user.id,
            receiver: userId,
            message,
            matchScore,
            sharedSubjects,
        });

        // Send push notification to receiver
        const sender = await User.findById(req.user.id).select('displayName username');
        await sendNotificationToUser(User, userId,
            NotificationTemplates.studyBuddyRequest(sender.displayName || sender.username)
        );

        res.status(201).json({
            status: 'success',
            data: { request },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   GET /api/v1/study-buddy/requests
 * @desc    Get pending study buddy requests
 * @access  Private
 */
router.get('/requests', async (req, res, next) => {
    try {
        const { type = 'received' } = req.query;

        const query = type === 'sent'
            ? { sender: req.user.id }
            : { receiver: req.user.id };

        const requests = await StudyBuddyRequest.find({
            ...query,
            status: 'pending',
        })
            .populate('sender', 'displayName username profilePic')
            .populate('receiver', 'displayName username profilePic')
            .sort({ createdAt: -1 });

        res.status(200).json({
            status: 'success',
            results: requests.length,
            data: { requests },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   PATCH /api/v1/study-buddy/requests/:requestId
 * @desc    Accept or reject a study buddy request
 * @access  Private
 */
router.patch('/requests/:requestId', async (req, res, next) => {
    try {
        const { requestId } = req.params;
        const { action } = req.body; // 'accept' or 'reject'

        if (!['accept', 'reject'].includes(action)) {
            return next(new AppError('Invalid action. Use "accept" or "reject"', 400));
        }

        const request = await StudyBuddyRequest.findById(requestId);

        if (!request) {
            return next(new AppError('Request not found', 404));
        }

        if (request.receiver.toString() !== req.user.id) {
            return next(new AppError('You can only respond to requests sent to you', 403));
        }

        if (request.status !== 'pending') {
            return next(new AppError('This request has already been responded to', 400));
        }

        request.status = action === 'accept' ? 'accepted' : 'rejected';
        request.respondedAt = new Date();
        await request.save();

        // If accepted, send notification to sender
        if (action === 'accept') {
            const receiver = await User.findById(req.user.id).select('displayName username');
            await sendNotificationToUser(User, request.sender,
                NotificationTemplates.studyBuddyMatch(receiver.displayName || receiver.username)
            );
        }

        res.status(200).json({
            status: 'success',
            data: { request },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   GET /api/v1/study-buddy/buddies
 * @desc    Get accepted study buddies
 * @access  Private
 */
router.get('/buddies', async (req, res, next) => {
    try {
        const acceptedRequests = await StudyBuddyRequest.find({
            $or: [
                { sender: req.user.id },
                { receiver: req.user.id },
            ],
            status: 'accepted',
        })
            .populate('sender', 'displayName username profilePic onlineStatus lastSeen')
            .populate('receiver', 'displayName username profilePic onlineStatus lastSeen')
            .sort({ respondedAt: -1 });

        // Format buddies list
        const buddies = acceptedRequests.map(req => {
            const isSender = req.sender._id.toString() === req.user?.id;
            const buddy = isSender ? req.receiver : req.sender;
            return {
                id: buddy._id,
                displayName: buddy.displayName,
                username: buddy.username,
                profilePic: buddy.profilePic,
                onlineStatus: buddy.onlineStatus,
                lastSeen: buddy.lastSeen,
                connectedAt: req.respondedAt,
                sharedSubjects: req.sharedSubjects,
                matchScore: req.matchScore,
            };
        });

        res.status(200).json({
            status: 'success',
            results: buddies.length,
            data: { buddies },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   DELETE /api/v1/study-buddy/buddies/:userId
 * @desc    Remove a study buddy connection
 * @access  Private
 */
router.delete('/buddies/:userId', async (req, res, next) => {
    try {
        const { userId } = req.params;

        const result = await StudyBuddyRequest.findOneAndDelete({
            $or: [
                { sender: req.user.id, receiver: userId },
                { sender: userId, receiver: req.user.id },
            ],
            status: 'accepted',
        });

        if (!result) {
            return next(new AppError('Study buddy connection not found', 404));
        }

        res.status(200).json({
            status: 'success',
            message: 'Study buddy connection removed',
        });
    } catch (error) {
        next(error);
    }
});

export default router;
