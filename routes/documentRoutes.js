import express from 'express';
import formidable from 'formidable';
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
import { fileParser } from '../middleware/fileParser.js';

const router = express.Router();

// Custom middleware to handle file uploads with formidable
const handleFileUpload = (req, res, next) => {
  const form = new formidable.IncomingForm({
    maxFileSize: 100 * 1024 * 1024, // 100MB max file size
    multiples: false, // Only allow one file per request
    keepExtensions: true,
    allowEmptyFiles: false
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Error parsing form data:', err);
      return res.status(400).json({
        status: 'error',
        message: 'Error processing file upload',
        details: err.message
      });
    }

    try {
      // Parse metadata if present
      if (fields.metadata) {
        try {
          fields.metadata = JSON.parse(fields.metadata);
        } catch (e) {
          console.error('Error parsing metadata:', e);
          return res.status(400).json({
            status: 'error',
            message: 'Invalid metadata format'
          });
        }
      }

      // Attach files and fields to the request object
      req.files = files;
      req.body = fields;
      next();
    } catch (error) {
      console.error('Error processing upload:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Error processing upload',
        details: error.message
      });
    }
  });
};

// Apply authentication to all routes
router.use(auth);

// Document stats (admin/instructor only)
router.get('/stats/:courseId', restrictTo('admin', 'instructor'), getDocumentStats);

// Upload a new document
router.post('/', handleFileUpload, uploadDocument);

// Get all documents (filtering, sorting, pagination)
router.get('/', getAllDocuments);

// Get a single document
router.get('/:id', getDocument);

// Update a document (owner or admin)
router.patch('/:id', handleFileUpload, updateDocument);

// Delete a document (owner or admin)
router.delete('/:id', deleteDocument);

// Download a document
router.get('/:id/download', downloadDocument);

export default router;
