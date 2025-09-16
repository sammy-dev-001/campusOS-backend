import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';
import Poll from '../models/Poll.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import asyncHandler from 'express-async-handler';
import AppError from '../utils/appError.js';

const router = express.Router();

// Helper function to get poll with results
const getPollWithResults = async (pollId, userId) => {
  const poll = await Poll.findById(pollId)
    .populate('createdBy', 'name email')
    .populate('options.votes', 'name email');

  if (!poll) {
    throw new AppError('No poll found with that ID', 404);
  }

  // Check if user has voted
  let userVote = null;
  for (const option of poll.options) {
    const hasVoted = option.votes.some(vote => vote._id.toString() === userId);
    if (hasVoted) {
      userVote = option.id;
      break;
    }
  }

  return {
    ...poll.toObject(),
    userVote,
    isExpired: poll.isExpired
  };
};

// Create a new poll
router.post('/', authenticateToken, asyncHandler(async (req, res, next) => {
  const { question, description, options, isMultipleChoice, isAnonymous, groupId, expiresAt } = req.body;
  const userId = req.user.id;

  // Validate input
  if (!question || !options || !Array.isArray(options) || options.length < 2) {
    return next(new AppError('Please provide a question and at least two options', 400));
  }

  // Create poll with options
  const poll = await Poll.create({
    question,
    description,
    options: options.map(opt => ({
      id: new mongoose.Types.ObjectId().toString(),
      text: opt.text,
      votes: []
    })),
    createdBy: userId,
    groupId: groupId || null,
    isMultipleChoice: !!isMultipleChoice,
    isAnonymous: !!isAnonymous,
    expiresAt: expiresAt ? new Date(expiresAt) : null
  });

  // Populate createdBy field
  await poll.populate('createdBy', 'name email');

  res.status(201).json({
    status: 'success',
    data: {
      poll
    }
  });
}));

// Get all polls (with pagination)
router.get('/', authenticateToken, asyncHandler(async (req, res, next) => {
  const { groupId, page = 1, limit = 10, active = 'true' } = req.query;
  const userId = req.user.id;
  const skip = (page - 1) * limit;

  // Build query
  const query = {};
  if (groupId) {
    query.groupId = groupId;
  }
  if (active === 'true') {
    query.$or = [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ];
  }

  // Get total count for pagination
  const total = await Poll.countDocuments(query);
  
  // Get polls with pagination
  const polls = await Poll.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .populate('createdBy', 'name email');

  // Add user's vote status to each poll
  const pollsWithVoteStatus = await Promise.all(
    polls.map(async (poll) => {
      const pollObj = poll.toObject();
      let userVote = null;
      
      for (const option of poll.options) {
        const hasVoted = option.votes.some(vote => vote.toString() === userId);
        if (hasVoted) {
          userVote = option.id;
          break;
        }
      }
      
      return {
        ...pollObj,
        userVote,
        isExpired: poll.expiresAt && poll.expiresAt < new Date()
      };
    })
  );

  res.status(200).json({
    status: 'success',
    results: polls.length,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: parseInt(page),
    data: {
      polls: pollsWithVoteStatus
    }
  });
}));

// Get single poll with results
router.get('/:pollId', authenticateToken, asyncHandler(async (req, res, next) => {
  const { pollId } = req.params;
  const userId = req.user.id;

  const poll = await getPollWithResults(pollId, userId);

  res.status(200).json({
    status: 'success',
    data: {
      poll
    }
  });
}));

// Vote on a poll
router.post('/:pollId/vote', authenticateToken, asyncHandler(async (req, res, next) => {
  const { pollId } = req.params;
  const { optionId } = req.body;
  const userId = req.user.id;

  // Find the poll
  const poll = await Poll.findById(pollId);
  if (!poll) {
    return next(new AppError('No poll found with that ID', 404));
  }

  // Check if poll is active
  if (poll.expiresAt && poll.expiresAt < new Date()) {
    return next(new AppError('This poll has expired', 400));
  }

  // Find the option
  const option = poll.options.find(opt => opt.id === optionId);
  if (!option) {
    return next(new AppError('No option found with that ID', 404));
  }

  // Check if user has already voted
  const hasVoted = poll.options.some(opt => 
    opt.votes.some(vote => vote.toString() === userId)
  );

  if (hasVoted && !poll.isMultipleChoice) {
    return next(new AppError('You have already voted on this poll', 400));
  }

  // Add vote
  option.votes.push(userId);
  await poll.save();

  // Get updated poll with results
  const updatedPoll = await getPollWithResults(pollId, userId);

  res.status(200).json({
    status: 'success',
    data: {
      poll: updatedPoll
    }
  });
}));

// Update a poll (only by creator)
router.patch('/:pollId', authenticateToken, asyncHandler(async (req, res, next) => {
  const { pollId } = req.params;
  const { question, description, expiresAt } = req.body;
  const userId = req.user.id;

  const poll = await Poll.findById(pollId);
  if (!poll) {
    return next(new AppError('No poll found with that ID', 404));
  }

  // Check if user is the creator
  if (poll.createdBy.toString() !== userId) {
    return next(new AppError('You are not authorized to update this poll', 403));
  }

  // Update fields
  if (question) poll.question = question;
  if (description !== undefined) poll.description = description;
  if (expiresAt !== undefined) poll.expiresAt = expiresAt ? new Date(expiresAt) : null;
  
  // Update isActive based on new expiresAt
  if (req.body.expiresAt !== undefined) {
    poll.isActive = !poll.expiresAt || poll.expiresAt > new Date();
  }

  await poll.save();
  await poll.populate('createdBy', 'name email');

  res.status(200).json({
    status: 'success',
    data: {
      poll
    }
  });
}));

// Delete a poll (only by creator or admin)
router.delete('/:pollId', authenticateToken, asyncHandler(async (req, res, next) => {
  const { pollId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  const poll = await Poll.findById(pollId);
  if (!poll) {
    return next(new AppError('No poll found with that ID', 404));
  }

  // Check if user is the creator or admin
  if (poll.createdBy.toString() !== userId && userRole !== 'admin') {
    return next(new AppError('You are not authorized to delete this poll', 403));
  }

  await Poll.findByIdAndDelete(pollId);

  res.status(204).json({
    status: 'success',
    data: null
  });
}));

export default router;
