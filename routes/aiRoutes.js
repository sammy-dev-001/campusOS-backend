/**
 * AI Routes
 * API endpoints for AI-powered study features
 */
import express from 'express';
import { protect } from '../middleware/auth.js';
import { aiService } from '../services/aiService.js';
import AppError from '../utils/appError.js';

const router = express.Router();

// Check AI availability middleware
const checkAI = (req, res, next) => {
    if (!aiService.isAvailable()) {
        return next(new AppError('AI service is not configured. Please contact support.', 503));
    }
    next();
};

// Protect all routes
router.use(protect);
router.use(checkAI);

/**
 * @route   POST /api/v1/ai/summarize
 * @desc    Summarize a document
 */
router.post('/summarize', async (req, res, next) => {
    try {
        const { text, maxLength, focus } = req.body;

        if (!text || text.length < 100) {
            return next(new AppError('Please provide at least 100 characters of text to summarize', 400));
        }

        const summary = await aiService.summarizeDocument(text, { maxLength, focus });

        res.status(200).json({
            status: 'success',
            data: { summary },
        });
    } catch (error) {
        next(new AppError(error.message || 'Failed to summarize document', 500));
    }
});

/**
 * @route   POST /api/v1/ai/quiz
 * @desc    Generate quiz from content
 */
router.post('/quiz', async (req, res, next) => {
    try {
        const { text, numQuestions, difficulty } = req.body;

        if (!text || text.length < 200) {
            return next(new AppError('Please provide at least 200 characters of content for quiz generation', 400));
        }

        const quiz = await aiService.generateQuiz(text, { numQuestions, difficulty });

        res.status(200).json({
            status: 'success',
            data: { quiz },
        });
    } catch (error) {
        next(new AppError(error.message || 'Failed to generate quiz', 500));
    }
});

/**
 * @route   POST /api/v1/ai/flashcards
 * @desc    Generate flashcards from content
 */
router.post('/flashcards', async (req, res, next) => {
    try {
        const { text, count } = req.body;

        if (!text || text.length < 100) {
            return next(new AppError('Please provide at least 100 characters of content', 400));
        }

        const flashcards = await aiService.generateFlashcards(text, count || 10);

        res.status(200).json({
            status: 'success',
            data: { flashcards },
        });
    } catch (error) {
        next(new AppError(error.message || 'Failed to generate flashcards', 500));
    }
});

/**
 * @route   POST /api/v1/ai/chat
 * @desc    Chat with AI assistant
 */
router.post('/chat', async (req, res, next) => {
    try {
        const { message, history } = req.body;

        if (!message || message.trim().length === 0) {
            return next(new AppError('Please provide a message', 400));
        }

        const response = await aiService.chat(message, history || []);

        res.status(200).json({
            status: 'success',
            data: { response },
        });
    } catch (error) {
        next(new AppError(error.message || 'Failed to get AI response', 500));
    }
});

/**
 * @route   GET /api/v1/ai/status
 * @desc    Check AI service status
 */
router.get('/status', (req, res) => {
    res.status(200).json({
        status: 'success',
        data: {
            available: aiService.isAvailable(),
            features: ['summarize', 'quiz', 'flashcards', 'chat'],
        },
    });
});

export default router;
