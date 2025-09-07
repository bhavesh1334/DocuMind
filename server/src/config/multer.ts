import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { validateFileType } from '@/utils/validation';

// Ensure upload directory exists
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = uuidv4();
    const extension = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${extension}`);
  },
});

// File filter function
const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  // Check file type
  if (!validateFileType(file.mimetype)) {
    return cb(new Error(`File type ${file.mimetype} is not supported`), false);
  }
  
  cb(null, true);
};

// Configure multer
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB default
    files: 5, // Maximum 5 files at once
  },
});

// Error handler for multer errors
export const handleMulterError = (error: any, req: any, res: any, next: any) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large',
        details: `Maximum file size is ${parseInt(process.env.MAX_FILE_SIZE || '10485760') / 1024 / 1024}MB`,
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files',
        details: 'Maximum 5 files allowed at once',
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field',
        details: 'Use "files" field for file uploads',
      });
    }
  }
  
  if (error.message) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
  
  next(error);
};