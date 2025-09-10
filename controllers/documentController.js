import Document from '../models/Document.js';
import { uploadSingleFile, deleteFromCloudinary } from '../utils/fileUpload.js';
import AppError from '../utils/appError.js';
import { getPublicIdFromUrl } from '../utils/fileUpload.js';

/**
 * @desc    Upload a new document
 * @route   POST /api/documents
 * @access  Private
 */
export const uploadDocument = async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new AppError('Please upload a file', 400));
    }

    // Get file info
    const fileType = getFileType(req.file.mimetype);
    
    // Upload to Cloudinary
    const uploadResult = await uploadSingleFile(
      req.file.buffer,
      'documents',
      {
        resource_type: fileType === 'image' ? 'image' : 'raw',
        format: fileType === 'other' ? undefined : fileType
      }
    );

    // Create document in database
    const document = await Document.create({
      title: req.body.title || req.file.originalname.split('.')[0],
      description: req.body.description,
      fileUrl: uploadResult.secure_url,
      fileType,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      createdBy: req.user.id,
      course: req.body.courseId,
      tags: req.body.tags ? req.body.tags.split(',').map(tag => tag.trim()) : [],
      isPublic: req.body.isPublic === 'true'
    });

    res.status(201).json({
      status: 'success',
      data: {
        document
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all documents with filtering, sorting, and pagination
 * @route   GET /api/documents
 * @access  Public/Private (depends on isPublic flag)
 */
export const getAllDocuments = async (req, res, next) => {
  try {
    // 1) Build the query
    const queryObj = { ...req.query };
    const excludedFields = ['page', 'sort', 'limit', 'fields'];
    excludedFields.forEach(el => delete queryObj[el]);

    // 2) Filtering
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, match => `$${match}`);
    
    let query = Document.find(JSON.parse(queryStr));

    // 3) Sorting
    if (req.query.sort) {
      const sortBy = req.query.sort.split(',').join(' ');
      query = query.sort(sortBy);
    } else {
      query = query.sort('-createdAt');
    }

    // 4) Field limiting
    if (req.query.fields) {
      const fields = req.query.fields.split(',').join(' ');
      query = query.select(fields);
    } else {
      query = query.select('-__v');
    }

    // 5) Pagination
    const page = req.query.page * 1 || 1;
    const limit = req.query.limit * 1 || 10;
    const skip = (page - 1) * limit;

    const total = await Document.countDocuments(JSON.parse(queryStr));
    query = query.skip(skip).limit(limit);

    // Execute query
    const documents = await query;

    res.status(200).json({
      status: 'success',
      results: documents.length,
      data: {
        documents,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get a single document
 * @route   GET /api/documents/:id
 * @access  Public/Private (depends on isPublic flag)
 */
export const getDocument = async (req, res, next) => {
  try {
    const document = await Document.findById(req.params.id);

    if (!document) {
      return next(new AppError('No document found with that ID', 404));
    }

    // Increment view count
    await document.incrementViewCount();

    res.status(200).json({
      status: 'success',
      data: {
        document
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a document
 * @route   PATCH /api/documents/:id
 * @access  Private (document owner or admin)
 */
export const updateDocument = async (req, res, next) => {
  try {
    // 1) Check if document exists and user is the owner
    const document = await Document.findOne({
      _id: req.params.id,
      createdBy: req.user.id
    });

    if (!document) {
      return next(new AppError('No document found with that ID or not authorized', 404));
    }

    // 2) Check if file is being updated
    if (req.file) {
      // If this is a new version of the document
      if (req.body.isNewVersion === 'true') {
        const fileType = getFileType(req.file.mimetype);
        
        // Upload new version to Cloudinary
        const uploadResult = await uploadSingleFile(
          req.file.buffer,
          'documents',
          {
            resource_type: fileType === 'image' ? 'image' : 'raw',
            format: fileType === 'other' ? undefined : fileType
          }
        );

        // Create new version
        const newVersion = await document.createNewVersion({
          url: uploadResult.secure_url,
          type: fileType,
          size: req.file.size,
          mimetype: req.file.mimetype
        });

        return res.status(200).json({
          status: 'success',
          data: {
            document: newVersion
          }
        });
      } else {
        // Just update the file
        const fileType = getFileType(req.file.mimetype);
        
        // Delete old file from Cloudinary
        const publicId = getPublicIdFromUrl(document.fileUrl);
        if (publicId) {
          await deleteFromCloudinary(publicId);
        }

        // Upload new file
        const uploadResult = await uploadSingleFile(
          req.file.buffer,
          'documents',
          {
            resource_type: fileType === 'image' ? 'image' : 'raw',
            format: fileType === 'other' ? undefined : fileType
          }
        );

        document.fileUrl = uploadResult.secure_url;
        document.fileType = fileType;
        document.fileSize = req.file.size;
        document.mimeType = req.file.mimetype;
      }
    }

    // 3) Update other fields if provided
    if (req.body.title) document.title = req.body.title;
    if (req.body.description !== undefined) document.description = req.body.description;
    if (req.body.tags) document.tags = req.body.tags.split(',').map(tag => tag.trim());
    if (req.body.isPublic !== undefined) document.isPublic = req.body.isPublic === 'true';

    // 4) Save the document
    await document.save();

    res.status(200).json({
      status: 'success',
      data: {
        document
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a document
 * @route   DELETE /api/documents/:id
 * @access  Private (document owner or admin)
 */
export const deleteDocument = async (req, res, next) => {
  try {
    const document = await Document.findOne({
      _id: req.params.id,
      createdBy: req.user.id
    });

    if (!document) {
      return next(new AppError('No document found with that ID or not authorized', 404));
    }

    // Delete file from Cloudinary
    const publicId = getPublicIdFromUrl(document.fileUrl);
    if (publicId) {
      await deleteFromCloudinary(publicId);
    }

    // Delete document from database
    await Document.findByIdAndDelete(req.params.id);

    // Delete all versions if this is a parent document
    if (!document.parentDocument) {
      await Document.deleteMany({ parentDocument: document._id });
    }

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Download a document
 * @route   GET /api/documents/:id/download
 * @access  Public/Private (depends on isPublic flag)
 */
export const downloadDocument = async (req, res, next) => {
  try {
    const document = await Document.findById(req.params.id);

    if (!document) {
      return next(new AppError('No document found with that ID', 404));
    }

    // Increment download count
    await document.incrementDownloadCount();

    // Redirect to the file URL for download
    res.redirect(document.fileUrl);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get document statistics for a course
 * @route   GET /api/documents/stats/:courseId
 * @access  Private
 */
export const getDocumentStats = async (req, res, next) => {
  try {
    const stats = await Document.getStats(req.params.courseId);
    
    res.status(200).json({
      status: 'success',
      data: {
        stats
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Helper function to determine file type from MIME type
 */
const getFileType = (mimetype) => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype === 'application/pdf') return 'pdf';
  if (mimetype === 'application/msword' || mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (mimetype === 'application/vnd.ms-powerpoint' || mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx';
  if (mimetype === 'application/vnd.ms-excel' || mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  if (mimetype.startsWith('text/')) return 'txt';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype.includes('zip') || mimetype.includes('compressed')) return 'archive';
  return 'other';
};
