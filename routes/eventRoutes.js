import express from 'express';
import {
  createEvent,
  getEvents,
  getEvent,
  updateEvent,
  deleteEvent,
  updateAttendance,
  getMyEvents,
  getAttendingEvents
} from '../controllers/eventController.js';
import { protect } from '../middleware/authMiddleware.js';
import { upload } from '../utils/fileUpload.js';

const router = express.Router();

// Public routes
router.get('/', getEvents);
router.get('/:id', getEvent);

// Protected routes (require authentication)
router.use(protect);

// Event management routes
router.post('/', upload.single('image'), createEvent);
router.put('/:id', upload.single('image'), updateEvent);
router.delete('/:id', deleteEvent);

// Event attendance routes
router.put('/:id/rsvp', updateAttendance);

// User-specific event routes
router.get('/my/events', getMyEvents);
router.get('/my/attending', getAttendingEvents);

export default router;
