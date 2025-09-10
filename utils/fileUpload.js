import { v2 as cloudinary } from 'cloudinary';
import streamifier from 'streamifier';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a file to Cloudinary
 * @param {Buffer} fileBuffer - The file buffer to upload
 * @param {string} folder - The folder to upload to (e.g., 'profile_pics', 'post_media')
 * @param {Object} options - Additional Cloudinary upload options
 * @returns {Promise<Object>} - The upload result
 */
const uploadToCloudinary = (fileBuffer, folder, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `campusos/${folder}`,
        resource_type: 'auto',
        ...options,
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          return reject(error);
        }
        resolve(result);
      }
    );

    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
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
