import express from 'express';
import multer from 'multer';
import { auth, admin, restrictTo } from '../middleware/auth.js';
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

// Configure multer for file uploads from React Native
const storage = multer.diskStorage({
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix);
  }
});

const upload = multer({
  storage: multer.memoryStorage(), // Store files in memory for processing
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size
    files: 1 // Only allow one file per request
  },
  fileFilter: (req, file, cb) => {
    // Accept all file types but validate in the controller
    console.log('Processing file upload:', file);
    cb(null, true);
  },
});

// Custom middleware to handle form data with files
const handleFormData = (req, res, next) => {
  upload.any()(req, res, (err) => {
    if (err) {
      console.error('Error processing form data:', err);
      return res.status(400).json({
        status: 'error',
        message: 'Error processing file upload',
        details: err.message
      });
    }
    
    // Parse metadata if present
    if (req.body.metadata) {
      try {
        req.body.metadata = JSON.parse(req.body.metadata);
      } catch (e) {
        console.error('Error parsing metadata:', e);
        return res.status(400).json({
          status: 'error',
          message: 'Invalid metadata format'
        });
      }
    }
    
    next();
  });
};

// Apply authentication to all routes
router.use(auth);

// Document stats (admin/instructor only)
router.get('/stats/:courseId', restrictTo('admin', 'instructor'), getDocumentStats);

// Upload a new document
router.post('/', handleFormData, uploadDocument);

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
