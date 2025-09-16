import express from 'express';
const router = express.Router();
import {
  createTimetable,
  getTimetables,
  getTimetableById,
  updateTimetable,
  deleteTimetable,
  getMyTimetable
} from '../controllers/timetableController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

// Public routes
router.route('/').get(getTimetables);
router.route('/:id').get(getTimetableById);

// Protected routes
router.route('/me')
  .get(protect, getMyTimetable);

// Admin routes
router.route('/')
  .post(protect, admin, createTimetable);

router.route('/:id')
  .put(protect, admin, updateTimetable)
  .delete(protect, admin, deleteTimetable);

export default router;
