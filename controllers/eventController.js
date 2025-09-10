import Event from '../models/Event.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';

/**
 * @desc    Create a new event
 * @route   POST /api/events
 * @access  Private
 */
export const createEvent = async (req, res, next) => {
  try {
    const { title, description, startDate, endDate, location, category, isFeatured = false } = req.body;
    
    const event = new Event({
      title,
      description,
      startDate,
      endDate,
      location,
      category,
      isFeatured,
      createdBy: req.user.id,
      imageUrl: req.file?.path || null
    });

    await event.save();
    
    // Populate the createdBy field with user details
    await event.populate('createdBy', 'username displayName profilePicture');
    
    res.status(201).json({
      success: true,
      data: event
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all events with pagination and filters
 * @route   GET /api/events
 * @access  Public
 */
export const getEvents = async (req, res, next) => {
  try {
    const { category, isFeatured, startDate, endDate, limit = 10, page = 1 } = req.query;
    
    const { events, total, totalPages } = await Event.getEvents({
      category,
      isFeatured: isFeatured === 'true' ? true : isFeatured === 'false' ? false : undefined,
      startDate,
      endDate,
      limit: parseInt(limit),
      page: parseInt(page)
    });

    res.status(200).json({
      success: true,
      count: events.length,
      total,
      totalPages,
      data: events
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single event by ID
 * @route   GET /api/events/:id
 * @access  Public
 */
export const getEvent = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('createdBy', 'username displayName profilePicture')
      .populate('attendees.user', 'username displayName profilePicture');
    
    if (!event) {
      throw new NotFoundError('Event not found');
    }

    res.status(200).json({
      success: true,
      data: event
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update event
 * @route   PUT /api/events/:id
 * @access  Private
 */
export const updateEvent = async (req, res, next) => {
  try {
    let event = await Event.findById(req.params.id);
    
    if (!event) {
      throw new NotFoundError('Event not found');
    }

    // Check if user is the event creator or admin
    if (event.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
      throw new BadRequestError('Not authorized to update this event');
    }

    const updates = { ...req.body };
    
    // Handle image update if file is uploaded
    if (req.file) {
      updates.imageUrl = req.file.path;
    }

    event = await Event.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    )
    .populate('createdBy', 'username displayName profilePicture')
    .populate('attendees.user', 'username displayName profilePicture');

    res.status(200).json({
      success: true,
      data: event
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete event
 * @route   DELETE /api/events/:id
 * @access  Private
 */
export const deleteEvent = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      throw new NotFoundError('Event not found');
    }

    // Check if user is the event creator or admin
    if (event.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
      throw new BadRequestError('Not authorized to delete this event');
    }

    await event.remove();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update attendance for an event
 * @route   PUT /api/events/:id/rsvp
 * @access  Private
 */
export const updateAttendance = async (req, res, next) => {
  try {
    const { status } = req.body;
    
    if (!['going', 'interested', 'not_going'].includes(status)) {
      throw new BadRequestError('Invalid status. Must be one of: going, interested, not_going');
    }

    const event = await Event.findById(req.params.id);
    
    if (!event) {
      throw new NotFoundError('Event not found');
    }

    // Update or add attendee status
    const attendeeIndex = event.attendees.findIndex(
      attendee => attendee.user.toString() === req.user.id
    );

    if (attendeeIndex >= 0) {
      // Update existing attendee status
      event.attendees[attendeeIndex].status = status;
    } else {
      // Add new attendee
      event.attendees.push({
        user: req.user.id,
        status
      });
    }

    await event.save();

    // Populate the updated attendee list
    await event.populate('attendees.user', 'username displayName profilePicture');

    res.status(200).json({
      success: true,
      data: event.attendees
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get events created by the authenticated user
 * @route   GET /api/events/my-events
 * @access  Private
 */
export const getMyEvents = async (req, res, next) => {
  try {
    const events = await Event.find({ createdBy: req.user.id })
      .sort({ startDate: -1 })
      .populate('createdBy', 'username displayName profilePicture')
      .populate('attendees.user', 'username displayName profilePicture');

    res.status(200).json({
      success: true,
      count: events.length,
      data: events
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get events the user is attending
 * @route   GET /api/events/attending
 * @access  Private
 */
export const getAttendingEvents = async (req, res, next) => {
  try {
    const events = await Event.find({ 'attendees.user': req.user.id })
      .sort({ startDate: -1 })
      .populate('createdBy', 'username displayName profilePicture')
      .populate('attendees.user', 'username displayName profilePicture');

    res.status(200).json({
      success: true,
      count: events.length,
      data: events
    });
  } catch (error) {
    next(error);
  }
};
