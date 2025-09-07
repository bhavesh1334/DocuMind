import express, { Router } from 'express';
import { upload, handleMulterError } from '@/config/multer';
import { validate, validateQuery } from '@/utils/validation';
import {
  uploadFileSchema,
  addUrlSchema,
  addTextSchema,
  documentFilterSchema,
} from '@/utils/validation';
import {
  uploadFiles,
  addUrl,
  addText,
  getDocuments,
  getDocument,
  deleteDocument,
  getDocumentSummary,
} from '@/controllers/documentController';

const router:Router = express.Router();

// Upload files
router.post(
  '/upload',
  upload.array('files', 5),
  handleMulterError,
  validate(uploadFileSchema),
  uploadFiles
);

// Add URL
router.post('/url', validate(addUrlSchema), addUrl);

// Add text
router.post('/text', validate(addTextSchema), addText);

// Get all documents with filtering and pagination
router.get('/', validateQuery(documentFilterSchema), getDocuments);

// Get document summary (lighter version for listing)
router.get('/summary', validateQuery(documentFilterSchema), getDocumentSummary);

// Get single document by ID
router.get('/:id', getDocument);

// Delete document
router.delete('/:id', deleteDocument);

export default router;