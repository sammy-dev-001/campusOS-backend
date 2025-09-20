import { v2 as cloudinary } from 'cloudinary';
import streamifier from 'streamifier';

// Configure Cloudinary with enhanced timeout settings
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
  timeout: 120000, // 2 minutes timeout
  upload_preset: 'ml_default', // Make sure to create this in your Cloudinary settings
  api_proxy: process.env.HTTP_PROXY, // If you're behind a proxy
});

// Set global timeout for all Cloudinary requests
cloudinary.config().timeout = 120000;

/**
 * Upload a file to Cloudinary
 * @param {Buffer} fileBuffer - The file buffer to upload
 * @param {string} folder - The folder to upload to (e.g., 'profile_pics', 'post_media')
 * @param {Object} options - Additional Cloudinary upload options
 * @returns {Promise<Object>} - The upload result
 */
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

const uploadToCloudinary = async (fileBuffer, folder, options = {}, retryCount = 0) => {
  return new Promise((resolve, reject) => {
    try {
      const uploadOptions = {
        folder: `campusos/${folder}`,
        resource_type: 'auto',
        timeout: 120000, // 2 minutes timeout
        chunk_size: 20000000, // 20MB chunks for large files
        ...options,
      };

      // Ensure we have a proper buffer
      let buffer;
      if (fileBuffer instanceof ArrayBuffer) {
        buffer = Buffer.from(fileBuffer);
      } else if (Buffer.isBuffer(fileBuffer)) {
        buffer = fileBuffer;
      } else if (fileBuffer?.buffer instanceof ArrayBuffer) {
        buffer = Buffer.from(fileBuffer.buffer);
      } else {
        throw new Error('Invalid file buffer format');
      }

      console.log(`Uploading file (${buffer.length} bytes) to folder: ${folder}`);
      
      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        async (error, result) => {
          if (error) {
            console.error(`Cloudinary upload error (attempt ${retryCount + 1}):`, error);
            
            // Retry logic for timeout errors
            if ((error.http_code === 499 || error.name === 'TimeoutError') && retryCount < MAX_RETRIES) {
              console.log(`Retrying upload (${retryCount + 1}/${MAX_RETRIES})...`);
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)));
              return uploadToCloudinary(buffer, folder, options, retryCount + 1)
                .then(resolve)
                .catch(reject);
            }
            
            return reject(error);
          }
          console.log('Upload successful:', result.public_id);
          resolve(result);
        }
      );

      // Handle stream errors
      uploadStream.on('error', (error) => {
        console.error('Upload stream error:', error);
        reject(error);
      });

      // Set a timeout for the upload
      const timeout = setTimeout(() => {
        uploadStream.emit('error', new Error('Upload timed out'));
      }, 120000); // 2 minutes timeout

      // Clean up the timeout when the upload completes
      uploadStream.on('finish', () => clearTimeout(timeout));

      // Start the upload
      const readStream = streamifier.createReadStream(buffer);
      
      // Handle stream errors
      readStream.on('error', (error) => {
        console.error('Read stream error:', error);
        clearTimeout(timeout);
        reject(error);
      });
      
      // Pipe the read stream to the upload stream
      readStream.pipe(uploadStream);
    } catch (error) {
      console.error('Error in uploadToCloudinary:', error);
      reject(error);
    }
  });
};

/**
 * Delete a file from Cloudinary
 * @param {string} publicId - The public ID of the file to delete
 * @param {Object} options - Additional Cloudinary delete options
 * @returns {Promise<Object>} - The deletion result
 */
const deleteFromCloudinary = (publicId, options = {}) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, options, (error, result) => {
      if (error) {
        console.error('Cloudinary delete error:', error);
        return reject(error);
      }
      resolve(result);
    });
  });
};

/**
 * Extract public ID from Cloudinary URL
 * @param {string} url - The Cloudinary URL
 * @returns {string} - The public ID
 */
const getPublicIdFromUrl = (url) => {
  if (!url) return null;
  const matches = url.match(/upload\/v\d+\/(.+?)(\.\w+)?$/);
  return matches ? matches[1] : null;
};

/**
 * Handle multiple file uploads
 * @param {Array<Buffer>} files - Array of file buffers
 * @param {string} folder - The folder to upload to
 * @param {Object} options - Additional Cloudinary options
 * @returns {Promise<Array<Object>>} - Array of upload results
 */
const uploadMultipleFiles = async (files, folder, options = {}) => {
  try {
    const uploadPromises = files.map(file => 
      uploadToCloudinary(file.buffer, folder, {
        ...options,
        filename_override: file.originalname,
        folder: `campusos/${folder}`,
      })
    );
    
    return await Promise.all(uploadPromises);
  } catch (error) {
    console.error('Error uploading multiple files:', error);
    throw error;
  }
};

/**
 * Handle single file upload
 * @param {Buffer} file - The file buffer
 * @param {string} folder - The folder to upload to
 * @param {Object} options - Additional Cloudinary options
 * @returns {Promise<Object>} - The upload result
 */
const uploadSingleFile = async (file, folder, options = {}) => {
  try {
    return await uploadToCloudinary(file.buffer, folder, {
      ...options,
      filename_override: file.originalname,
      folder: `campusos/${folder}`,
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
};

export {
  uploadToCloudinary,
  deleteFromCloudinary,
  getPublicIdFromUrl,
  uploadMultipleFiles,
  uploadSingleFile,
  cloudinary,
};
