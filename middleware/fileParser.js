import formidable from 'formidable';
import fs from 'fs';
import path from 'path';

/**
 * Middleware to handle file uploads using formidable
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const fileParser = (req, res, next) => {
  // Create uploads directory if it doesn't exist
  const uploadDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const form = new formidable.IncomingForm({
    uploadDir,
    keepExtensions: true,
    maxFileSize: 100 * 1024 * 1024, // 100MB max file size
    filter: ({ name, originalFilename, mimetype }) => {
      // Only allow certain file types
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'image/jpeg',
        'image/png',
        'image/gif'
      ];

      if (!allowedTypes.includes(mimetype)) {
        return false;
      }
      return true;
    }
  });

  form.parse(req, (err, fields, files) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ 
          status: 'error',
          message: 'File size exceeds the maximum limit of 100MB' 
        });
      }
      return res.status(400).json({ 
        status: 'error',
        message: 'Error parsing form data',
        error: err.message 
      });
    }

    // Attach parsed fields and files to the request object
    req.body = fields;
    req.files = files;
    
    // Convert file paths to be relative to the project root
    if (files) {
      Object.keys(files).forEach(key => {
        const file = files[key];
        if (Array.isArray(file)) {
          file.forEach(f => {
            f.path = path.relative(process.cwd(), f.filepath);
          });
        } else {
          file.path = path.relative(process.cwd(), file.filepath);
        }
      });
    }

    next();
  });
};

/**
 * Middleware to clean up uploaded files after the response is sent
 */
export const cleanupUploads = (req, res, next) => {
  // Skip if there are no files to clean up
  if (!req.files) return next();

  // Store the original send function
  const originalSend = res.send;
  
  // Override the send function to clean up files after the response is sent
  res.send = function (body) {
    // Clean up files
    Object.values(req.files).forEach(file => {
      if (Array.isArray(file)) {
        file.forEach(f => {
          cleanupFile(f.filepath);
        });
      } else {
        cleanupFile(file.filepath);
      }
    });
    
    // Call the original send function
    return originalSend.call(this, body);
  };

  next();
};

/**
 * Helper function to safely delete a file
 * @param {string} filePath - Path to the file to delete
 */
const cleanupFile = (filePath) => {
  if (!filePath) return;
  
  const fullPath = path.isAbsolute(filePath) 
    ? filePath 
    : path.join(process.cwd(), filePath);

  fs.unlink(fullPath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error(`Error deleting file ${fullPath}:`, err);
    }
  });
};
