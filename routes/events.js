import express from 'express';
import Event from '../models/Event.new.js';
import { auth } from '../middleware/auth.js';
import AppError from '../utils/appError.js';

const router = express.Router();

// Create a new event
router.post('/', auth, async (req, res, next) => {
  try {
    const event = await Event.create({
      ...req.body,
      createdBy: req.user.id
    });
    
    await event.populate('createdBy', 'username displayName profilePicture');
    res.status(201).json({
      status: 'success',
      data: {
        event
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get all events with optional filters
router.get('/', async (req, res, next) => {
  try {
    const { category, featured, limit = 20, page = 1, startDate, endDate } = req.query;
    
    const events = await Event.getEvents({
      category,
      isFeatured: featured === 'true',
      startDate,
      endDate,
      limit: parseInt(limit),
      page: parseInt(page)
    });
    
    res.json({
      status: 'success',
      results: events.events.length,
      data: {
        events: events.events,
        pagination: {
          total: events.total,
          page: events.page,
          totalPages: events.totalPages
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get a single event by ID
router.get('/:id', async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('createdBy', 'username displayName profilePicture')
      .populate('attendees.user', 'username displayName profilePicture');
      
    if (!event) {
      return next(new AppError('No event found with that ID', 404));
    }
    
    res.json({
      status: 'success',
      data: {
        event
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update an event
router.put('/:id', auth, async (req, res, next) => {
  try {
    // Only allow the event creator to update
    const event = await Event.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user.id },
      req.body,
      {
        new: true,
        runValidators: true
      }
    )
    .populate('createdBy', 'username displayName profilePicture')
    .populate('attendees.user', 'username displayName profilePicture');
    
    if (!event) {
      return next(new AppError('No event found with that ID or not authorized', 404));
    }
    
    res.json({
      status: 'success',
      data: {
        event
      }
    });
  } catch (error) {
    next(error);
  }
});

// Delete an event
router.delete('/:id', auth, async (req, res, next) => {
  try {
    const event = await Event.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user.id
    });
    
    if (!event) {
      return next(new AppError('No event found with that ID or not authorized', 404));
    }
    
    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    next(error);
  }
});

// RSVP to an event
router.post('/:id/rsvp', auth, async (req, res, next) => {
  try {
    const { status } = req.body;
    
    // Find the event
    const event = await Event.findById(req.params.id);
    if (!event) {
      return next(new AppError('No event found with that ID', 404));
    }
    
    // Update or add attendee status
    const updatedEvent = await event.updateAttendee(req.user.id, status);
    
    // Populate the user data in the response
    await event.populate('attendees.user', 'username displayName profilePicture');
    
    // Find the updated attendee in the event
    const attendee = event.attendees.find(
      a => a.user._id.toString() === req.user.id.toString()
    );
    
    res.json({
      status: 'success',
      data: {
        attendee
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get event attendees
router.get('/:id/attendees', async (req, res, next) => {
  try {
    const { status } = req.query;
    
    // Find the event and populate attendees
    const event = await Event.findById(req.params.id)
      .select('attendees')
      .populate('attendees.user', 'username displayName profilePicture');
      
    if (!event) {
      return next(new AppError('No event found with that ID', 404));
    }
    
    // Filter by status if provided
    let attendees = event.attendees;
    if (status) {
      attendees = attendees.filter(attendee => attendee.status === status);
    }
    
    res.json({
      status: 'success',
      results: attendees.length,
      data: {
        attendees
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
