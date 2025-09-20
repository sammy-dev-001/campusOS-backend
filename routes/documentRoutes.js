import express from 'express';
import { auth, admin } from '../middleware/auth.js';
import { fileParser } from '../middleware/fileParser.js';
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

// Apply authentication to all routes
router.use(auth);

// Document stats (admin only)
router.get('/stats', admin, getDocumentStats);

// Document routes
router
  .route('/')
  .get(getAllDocuments)  // Get all documents with optional filtering
  .post(admin, fileParser, uploadDocument);  // Upload new document (admin only)

router
  .route('/:id')
  .get(getDocument)  // Get a single document
  .patch(admin, fileParser, updateDocument)  // Update document (admin only)
  .delete(admin, deleteDocument);  // Delete document (admin only)

// Download document
router.get('/:id/download', downloadDocument);

export default router;
