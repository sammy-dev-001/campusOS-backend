import Timetable from '../models/Timetable.js';
import asyncHandler from 'express-async-handler';

// @desc    Create a new timetable entry
// @route   POST /api/timetables
// @access  Private/Admin
const createTimetable = asyncHandler(async (req, res) => {
  const {
    course,
    tutor,
    dayOfWeek,
    startTime,
    endTime,
    location,
    room,
    isOnline,
    meetingLink,
    recurring,
    startDate,
    endDate
  } = req.body;

  const timetable = new Timetable({
    course,
    tutor,
    dayOfWeek,
    startTime,
    endTime,
    location,
    room,
    isOnline,
    meetingLink: isOnline ? meetingLink : undefined,
    recurring,
    startDate,
    endDate: recurring ? endDate : undefined,
    createdBy: req.user._id
  });

  const createdTimetable = await timetable.save();
  res.status(201).json(createdTimetable);
});

// @desc    Get all timetable entries
// @route   GET /api/timetables
// @access  Public
const getTimetables = asyncHandler(async (req, res) => {
  const { 
    course, 
    tutor, 
    dayOfWeek, 
    startDate, 
    endDate,
    isOnline 
  } = req.query;

  const query = {};
  
  if (course) query.course = course;
  if (tutor) query.tutor = tutor;
  if (dayOfWeek) query.dayOfWeek = dayOfWeek.toLowerCase();
  if (isOnline) query.isOnline = isOnline === 'true';
  
  // Date range query
  if (startDate || endDate) {
    query.$and = [];
    
    if (startDate) {
      query.$and.push({
        $or: [
          { endDate: { $gte: new Date(startDate) } },
          { endDate: { $exists: false } }
        ]
      });
    }
    
    if (endDate) {
      query.$and.push({
        startDate: { $lte: new Date(endDate) }
      });
    }
  }

  const timetables = await Timetable.find(query)
    .populate('course', 'name code')
    .populate('tutor', 'name')
    .sort({ dayOfWeek: 1, startTime: 1 });
    
  res.json(timetables);
});

// @desc    Get timetable by ID
// @route   GET /api/timetables/:id
// @access  Public
const getTimetableById = asyncHandler(async (req, res) => {
  const timetable = await Timetable.findById(req.params.id)
    .populate('course', 'name code')
    .populate('tutor', 'name email')
    .populate('createdBy', 'name');

  if (timetable) {
    res.json(timetable);
  } else {
    res.status(404);
    throw new Error('Timetable entry not found');
  }
});

// @desc    Update timetable
// @route   PUT /api/timetables/:id
// @access  Private/Admin
const updateTimetable = asyncHandler(async (req, res) => {
  const {
    course,
    tutor,
    dayOfWeek,
    startTime,
    endTime,
    location,
    room,
    isOnline,
    meetingLink,
    recurring,
    startDate,
    endDate
  } = req.body;

  const timetable = await Timetable.findById(req.params.id);

  if (!timetable) {
    res.status(404);
    throw new Error('Timetable entry not found');
  }

  timetable.course = course || timetable.course;
  timetable.tutor = tutor || timetable.tutor;
  timetable.dayOfWeek = dayOfWeek || timetable.dayOfWeek;
  timetable.startTime = startTime || timetable.startTime;
  timetable.endTime = endTime || timetable.endTime;
  timetable.location = location !== undefined ? location : timetable.location;
  timetable.room = room !== undefined ? room : timetable.room;
  timetable.isOnline = isOnline !== undefined ? isOnline : timetable.isOnline;
  timetable.meetingLink = isOnline ? (meetingLink || '') : '';
  timetable.recurring = recurring !== undefined ? recurring : timetable.recurring;
  timetable.startDate = startDate || timetable.startDate;
  timetable.endDate = recurring ? (endDate || timetable.endDate) : undefined;
  timetable.lastModifiedBy = req.user._id;

  const updatedTimetable = await timetable.save();
  res.json(updatedTimetable);
});

// @desc    Delete timetable
// @route   DELETE /api/timetables/:id
// @access  Private/Admin
const deleteTimetable = asyncHandler(async (req, res) => {
  const timetable = await Timetable.findById(req.params.id);

  if (timetable) {
    await timetable.remove();
    res.json({ message: 'Timetable entry removed' });
  } else {
    res.status(404);
    throw new Error('Timetable entry not found');
  }
});

// @desc    Get timetable for current user
// @route   GET /api/timetables/me
// @access  Private
const getMyTimetable = asyncHandler(async (req, res) => {
  // For students: Get timetable for their enrolled courses
  // For tutors: Get their teaching schedule
  const query = req.user.role === 'tutor' 
    ? { tutor: req.user._id }
    : { course: { $in: req.user.enrolledCourses || [] } };

  const timetables = await Timetable.find(query)
    .populate('course', 'name code')
    .populate('tutor', 'name')
    .sort({ dayOfWeek: 1, startTime: 1 });

  res.json(timetables);
});

export {
  createTimetable,
  getTimetables,
  getTimetableById,
  updateTimetable,
  deleteTimetable,
  getMyTimetable
};
