import Announcement from '../models/Announcement.js';
import asyncHandler from 'express-async-handler';

// @desc    Create a new announcement
// @route   POST /api/announcements
// @access  Private/Admin
const createAnnouncement = asyncHandler(async (req, res) => {
  const { title, content, targetAudience, isPinned, expiryDate } = req.body;

  const announcement = new Announcement({
    title,
    content,
    targetAudience: targetAudience || ['all'],
    isPinned: isPinned || false,
    expiryDate: expiryDate || new Date(+new Date() + 7*24*60*60*1000),
    author: req.user._id
  });

  const createdAnnouncement = await announcement.save();
  res.status(201).json(createdAnnouncement);
});

// @desc    Get all announcements
// @route   GET /api/announcements
// @access  Public
const getAnnouncements = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, pinned } = req.query;
  const query = {};
  
  if (pinned === 'true') {
    query.isPinned = true;
  }

  const announcements = await Announcement.find(query)
    .sort({ isPinned: -1, createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .populate('author', 'name email')
    .lean();

  const count = await Announcement.countDocuments(query);

  res.json({
    announcements,
    totalPages: Math.ceil(count / limit),
    currentPage: page
  });
});

// @desc    Get announcement by ID
// @route   GET /api/announcements/:id
// @access  Public
const getAnnouncementById = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id)
    .populate('author', 'name email');

  if (announcement) {
    res.json(announcement);
  } else {
    res.status(404);
    throw new Error('Announcement not found');
  }
});

// @desc    Update announcement
// @route   PUT /api/announcements/:id
// @access  Private/Admin
const updateAnnouncement = asyncHandler(async (req, res) => {
  const { title, content, targetAudience, isPinned, expiryDate } = req.body;
  const announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    res.status(404);
    throw new Error('Announcement not found');
  }

  // Check if user is admin or the author
  if (announcement.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    res.status(401);
    throw new Error('Not authorized to update this announcement');
  }

  announcement.title = title || announcement.title;
  announcement.content = content || announcement.content;
  announcement.targetAudience = targetAudience || announcement.targetAudience;
  announcement.isPinned = isPinned !== undefined ? isPinned : announcement.isPinned;
  announcement.expiryDate = expiryDate || announcement.expiryDate;

  const updatedAnnouncement = await announcement.save();
  res.json(updatedAnnouncement);
});

// @desc    Delete announcement
// @route   DELETE /api/announcements/:id
// @access  Private/Admin
const deleteAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    res.status(404);
    throw new Error('Announcement not found');
  }

  // Check if user is admin or the author
  if (announcement.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    res.status(401);
    throw new Error('Not authorized to delete this announcement');
  }

  await announcement.remove();
  res.json({ message: 'Announcement removed' });
});

export {
  createAnnouncement,
  getAnnouncements,
  getAnnouncementById,
  updateAnnouncement,
  deleteAnnouncement
};
