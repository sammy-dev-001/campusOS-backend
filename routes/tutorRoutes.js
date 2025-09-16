import express from 'express';
const router = express.Router();
import {
  createOrUpdateTutorProfile,
  getTutors,
  getTutorById,
  getMyTutorProfile,
  deleteTutorProfile
} from '../controllers/tutorController.js';
import { protect, tutor } from '../middleware/authMiddleware.js';

// Public routes
router.route('/').get(getTutors);
router.route('/:id').get(getTutorById);

// Protected routes
router.route('/profile/me')
  .get(protect, tutor, getMyTutorProfile)
  .post(protect, tutor, createOrUpdateTutorProfile)
  .delete(protect, tutor, deleteTutorProfile);

export default router;
