import Tutor from '../models/Tutor.js';
import User from '../models/User.js';
import asyncHandler from 'express-async-handler';

// @desc    Create or update tutor profile
// @route   POST /api/tutors
// @access  Private/Tutor
const createOrUpdateTutorProfile = asyncHandler(async (req, res) => {
  const {
    department,
    bio,
    qualifications,
    availability,
    courses
  } = req.body;

  // Check if tutor profile already exists
  let tutor = await Tutor.findOne({ user: req.user._id });

  if (tutor) {
    // Update existing tutor profile
    tutor.department = department || tutor.department;
    tutor.bio = bio || tutor.bio;
    tutor.qualifications = qualifications || tutor.qualifications;
    tutor.availability = availability || tutor.availability;
    tutor.courses = courses || tutor.courses;
    
    const updatedTutor = await tutor.save();
    res.json(updatedTutor);
  } else {
    // Create new tutor profile
    tutor = new Tutor({
      user: req.user._id,
      department,
      bio,
      qualifications: qualifications || [],
      availability: availability || [],
      courses: courses || []
    });

    const createdTutor = await tutor.save();
    
    // Update user role to tutor if not already
    const user = await User.findById(req.user._id);
    if (user.role !== 'tutor' && user.role !== 'admin') {
      user.role = 'tutor';
      await user.save();
    }
    
    res.status(201).json(createdTutor);
  }
});

// @desc    Get all tutors
// @route   GET /api/tutors
// @access  Public
const getTutors = asyncHandler(async (req, res) => {
  const { department, course, available } = req.query;
  const query = {};
  
  if (department) {
    query.department = { $regex: department, $options: 'i' };
  }
  
  if (course) {
    query.courses = course;
  }
  
  if (available === 'true') {
    query.isAvailable = true;
  }

  const tutors = await Tutor.find(query)
    .populate('user', 'name email avatar')
    .populate('courses', 'name code');
    
  res.json(tutors);
});

// @desc    Get tutor by ID
// @route   GET /api/tutors/:id
// @access  Public
const getTutorById = asyncHandler(async (req, res) => {
  const tutor = await Tutor.findById(req.params.id)
    .populate('user', 'name email avatar')
    .populate('courses', 'name code description');

  if (tutor) {
    res.json(tutor);
  } else {
    res.status(404);
    throw new Error('Tutor not found');
  }
});

// @desc    Get current tutor profile
// @route   GET /api/tutors/profile/me
// @access  Private/Tutor
const getMyTutorProfile = asyncHandler(async (req, res) => {
  const tutor = await Tutor.findOne({ user: req.user._id })
    .populate('user', 'name email avatar')
    .populate('courses', 'name code');

  if (tutor) {
    res.json(tutor);
  } else {
    res.status(404);
    throw new Error('Tutor profile not found');
  }
});

// @desc    Delete tutor profile
// @route   DELETE /api/tutors/profile
// @access  Private/Tutor
const deleteTutorProfile = asyncHandler(async (req, res) => {
  const tutor = await Tutor.findOne({ user: req.user._id });

  if (tutor) {
    // Update user role if not admin
    const user = await User.findById(req.user._id);
    if (user.role === 'tutor') {
      user.role = 'student';
      await user.save();
    }
    
    await tutor.remove();
    res.json({ message: 'Tutor profile removed' });
  } else {
    res.status(404);
    throw new Error('Tutor profile not found');
  }
});

export {
  createOrUpdateTutorProfile,
  getTutors,
  getTutorById,
  getMyTutorProfile,
  deleteTutorProfile
};
