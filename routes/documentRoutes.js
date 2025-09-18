import express from 'express';
import multer from 'multer';
import { auth, admin } from '../middleware/auth.js';
import {
  uploadDocument,
  getAllDocuments,
  getDocument,
  updateDocument,
  deleteDocument,
  downloadDocument,
  getDocumentStats
} from '../controllers/documentController.js';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept all file types but validate in the controller
    cb(null, true);
  },
});

// Apply authentication to all routes
router.use(auth);

// Document stats (admin/instructor only)
router.get('/stats/:courseId', restrictTo('admin', 'instructor'), getDocumentStats);

// Upload a new document
router.post('/', upload.single('file'), uploadDocument);

// Get all documents (filtering, sorting, pagination)
router.get('/', getAllDocuments);

// Get a single document
router.get('/:id', getDocument);

// Update a document (owner or admin)
router.patch('/:id', upload.single('file'), updateDocument);

// Delete a document (owner or admin)
router.delete('/:id', deleteDocument);

// Download a document
router.get('/:id/download', downloadDocument);

export default router;
