import express from 'express';
const router = express.Router();
import {
  createAnnouncement,
  getAnnouncements,
  getAnnouncementById,
  updateAnnouncement,
  deleteAnnouncement
} from '../controllers/announcementController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

router.route('/')
  .get(getAnnouncements)
  .post(protect, admin, createAnnouncement);

router.route('/:id')
  .get(getAnnouncementById)
  .put(protect, admin, updateAnnouncement)
  .delete(protect, admin, deleteAnnouncement);

export default router;
