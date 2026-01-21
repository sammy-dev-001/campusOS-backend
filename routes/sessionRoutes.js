/**
 * Session Routes
 * API endpoints for session management
 */
import express from 'express';
import jwt from 'jsonwebtoken';
import { protect } from '../middleware/auth.js';
import User from '../models/User.js';
import AppError from '../utils/appError.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

/**
 * @route   GET /api/v1/sessions
 * @desc    Get all active sessions for current user
 */
router.get('/', async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).select('+activeSessions');

        res.status(200).json({
            status: 'success',
            data: {
                sessions: user?.activeSessions || [],
                currentSessionId: req.sessionId,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/v1/sessions/register
 * @desc    Register a new session/device
 */
router.post('/register', async (req, res, next) => {
    try {
        const { deviceId, deviceName, platform } = req.body;

        const session = {
            sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            deviceId: deviceId || 'unknown',
            deviceName: deviceName || 'Unknown Device',
            platform: platform || 'unknown',
            createdAt: new Date(),
            lastActivity: new Date(),
            ipAddress: req.ip,
        };

        await User.findByIdAndUpdate(req.user.id, {
            $push: {
                activeSessions: {
                    $each: [session],
                    $slice: -10, // Keep only last 10 sessions
                },
            },
        });

        res.status(201).json({
            status: 'success',
            data: { session },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   PATCH /api/v1/sessions/activity
 * @desc    Update session activity timestamp
 */
router.patch('/activity', async (req, res, next) => {
    try {
        const { sessionId } = req.body;

        await User.findOneAndUpdate(
            { _id: req.user.id, 'activeSessions.sessionId': sessionId },
            { $set: { 'activeSessions.$.lastActivity': new Date() } }
        );

        res.status(200).json({
            status: 'success',
            message: 'Activity updated',
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   DELETE /api/v1/sessions/:sessionId
 * @desc    Terminate a specific session
 */
router.delete('/:sessionId', async (req, res, next) => {
    try {
        const { sessionId } = req.params;

        await User.findByIdAndUpdate(req.user.id, {
            $pull: { activeSessions: { sessionId } },
        });

        res.status(200).json({
            status: 'success',
            message: 'Session terminated',
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   DELETE /api/v1/sessions
 * @desc    Terminate all other sessions (logout everywhere else)
 */
router.delete('/', async (req, res, next) => {
    try {
        const { keepCurrentSession } = req.query;
        const currentSessionId = req.body.currentSessionId;

        if (keepCurrentSession && currentSessionId) {
            // Keep only current session
            const user = await User.findById(req.user.id).select('+activeSessions');
            const currentSession = user?.activeSessions?.find(s => s.sessionId === currentSessionId);

            await User.findByIdAndUpdate(req.user.id, {
                activeSessions: currentSession ? [currentSession] : [],
            });
        } else {
            // Clear all sessions
            await User.findByIdAndUpdate(req.user.id, {
                activeSessions: [],
            });
        }

        res.status(200).json({
            status: 'success',
            message: 'Sessions terminated',
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/v1/sessions/biometric-token
 * @desc    Generate a token for biometric login
 */
router.post('/biometric-token', async (req, res, next) => {
    try {
        const { deviceId } = req.body;

        if (!deviceId) {
            return next(new AppError('Device ID is required', 400));
        }

        // Store biometric device ID for this user
        await User.findByIdAndUpdate(req.user.id, {
            $addToSet: { biometricDevices: deviceId },
        });

        // Generate a long-lived biometric token
        const biometricToken = jwt.sign(
            { id: req.user.id, deviceId, type: 'biometric' },
            process.env.JWT_SECRET,
            { expiresIn: '365d' }
        );

        res.status(200).json({
            status: 'success',
            data: { biometricToken },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/v1/sessions/biometric-login
 * @desc    Login using biometric token
 */
router.post('/biometric-login', async (req, res, next) => {
    try {
        const { biometricToken, deviceId } = req.body;

        if (!biometricToken || !deviceId) {
            return next(new AppError('Biometric token and device ID required', 400));
        }

        // Verify the biometric token
        const decoded = jwt.verify(biometricToken, process.env.JWT_SECRET);

        if (decoded.type !== 'biometric' || decoded.deviceId !== deviceId) {
            return next(new AppError('Invalid biometric token', 401));
        }

        // Check if device is still authorized
        const user = await User.findById(decoded.id).select('+biometricDevices');
        if (!user?.biometricDevices?.includes(deviceId)) {
            return next(new AppError('Device not authorized for biometric login', 401));
        }

        // Generate new access token
        const token = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        res.status(200).json({
            status: 'success',
            data: { token, user },
        });
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return next(new AppError('Invalid biometric token', 401));
        }
        next(error);
    }
});

/**
 * @route   DELETE /api/v1/sessions/biometric/:deviceId
 * @desc    Remove biometric authorization for a device
 */
router.delete('/biometric/:deviceId', async (req, res, next) => {
    try {
        const { deviceId } = req.params;

        await User.findByIdAndUpdate(req.user.id, {
            $pull: { biometricDevices: deviceId },
        });

        res.status(200).json({
            status: 'success',
            message: 'Biometric authorization removed',
        });
    } catch (error) {
        next(error);
    }
});

export default router;
