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
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    
    // Get total count of announcements
    const total = await Announcement.countDocuments({});
    
    // Get paginated announcements
    const announcements = await Announcement.find({})
      .sort({ isPinned: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('author', 'name email')
      .lean();

    res.json({
      announcements: announcements || [],
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error fetching announcements:', error);
    // Return empty array instead of error to prevent frontend crashes
    res.json({
      announcements: [],
      currentPage: 1,
      totalPages: 1
    });
  }
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
