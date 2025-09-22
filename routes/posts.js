// Get all comments for a post
router.get('/:id/comments', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate({
        path: 'comments.author',
        select: 'username profilePic'
      });
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    // If comments are subdocuments, just return them
    // If comments are refs, you may need to adjust this logic
    res.json(post.comments || []);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ message: 'Error fetching comments' });
  }
});
import express from 'express';
import { auth } from '../middleware/auth.js';
import Post from '../models/Post.js';
import { v2 as cloudinary } from 'cloudinary';

const router = express.Router();

// Get the upload middleware from app settings
const getUploadMiddleware = (req, res, next) => {
  const upload = req.app.get('postUpload');
  if (!upload) {
    return res.status(500).json({ message: 'Upload middleware not configured' });
  }
  return upload.single('media')(req, res, next);
};

// Helper to handle post creation
const createPost = async (req, content, mediaFile = null) => {
  const postData = {
    content: content || '',
    author: req.user.id,
    media: []
  };

  // If we have media data, parse and add it
  if (mediaFile) {
    // Get the Cloudinary URL from the uploaded file
    const cloudinaryUrl = mediaFile.path || mediaFile.location || mediaFile.secure_url;
    
    // Ensure we have a valid URL
    if (!cloudinaryUrl) {
      console.error('No valid URL found in mediaFile:', mediaFile);
      throw new Error('Failed to get media URL');
    }
    
    // Extract filename without extension for publicId
    const filename = mediaFile.originalname || mediaFile.filename || '';
    const publicId = filename.split('.')[0] || `post_${Date.now()}`;
    
    let mediaObject = {
      url: cloudinaryUrl,
      mediaType: mediaFile.mimetype.startsWith('image/') ? 'image' : 
                mediaFile.mimetype.startsWith('video/') ? 'video' :
                mediaFile.mimetype.startsWith('audio/') ? 'audio' : 'document',
      publicId: publicId,
      altText: 'User uploaded content',
      width: 0,
      height: 0
    };

    // Try to parse additional metadata if available
    try {
      if (req.body.mediaData) {
        const additionalData = JSON.parse(req.body.mediaData);
        // Preserve the cloudinary URL from the file upload
        const { url, ...rest } = additionalData;
        mediaObject = { 
          ...mediaObject, 
          ...rest, 
          // Always use the cloudinary URL from the file upload
          url: mediaObject.url 
        };
      }
    } catch (e) {
      console.log('Error parsing media metadata:', e);
    }

    postData.media = [mediaObject];
  }

  const post = new Post(postData);
  await post.save();
  await post.populate('author', 'username profilePic');
  return post;
};

// Get all posts
router.get('/', async (req, res) => {
  try {
    console.log('Fetching posts with query params:', req.query);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const posts = await Post.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'username profilePic');
      
    console.log(`Found ${posts.length} posts`);
    res.json(posts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ message: 'Error fetching posts' });
  }
});

// Create a new post (handles both JSON and form-data)
router.post('/', auth, async (req, res, next) => {
  console.log('Received post request:', {
    method: req.method,
    contentType: req.headers['content-type'],
    hasFile: !!req.file,
    body: req.body
  });

  // If content-type is application/json, handle as JSON
  if (req.is('application/json')) {
    try {
      console.log('Received JSON post request:', req.body);
      const { content } = req.body;
      
      if (!content && !req.file) {
        return res.status(400).json({ message: 'Content or media is required' });
      }
      
      const post = await createPost(req, content);
      return res.status(201).json(post);
      
    } catch (error) {
      console.error('Error in JSON post handler:', error);
      return res.status(500).json({ 
        message: error.message || 'Error creating post',
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined 
      });
    }
  }
  
  // Otherwise, use the file upload middleware
  return getUploadMiddleware(req, res, async (err) => {
    if (err) {
      console.error('File upload error:', err);
      return res.status(400).json({ message: err.message || 'File upload failed' });
    }
    
    try {
      console.log('Received form-data post request');
      console.log('Body:', req.body);
      console.log('File:', req.file);
      
      const content = req.body.content || '';
      let mediaUrl = null;

      // Only require content if there's no file
      if (!content && !req.file) {
        return res.status(400).json({ message: 'Content or media is required' });
      }
      
      const post = await createPost(req, content, req.file);
      return res.status(201).json(post);
      
    } catch (error) {
      console.error('Error in form-data post handler:', error);
      return res.status(500).json({ 
        message: error.message || 'Error creating post',
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined 
      });
    }
  });
});

// Get all posts
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const posts = await Post.find()
      .populate('author', 'username profilePic')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await Post.countDocuments();
    
    res.json({
      posts,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ message: 'Error fetching posts' });
  }
});

// Get a single post
router.get('/:id', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('author', 'username profilePic')
      .populate({
        path: 'comments',
        populate: {
          path: 'author',
          select: 'username profilePic'
        }
      });
      
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    res.json(post);
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({ message: 'Error fetching post' });
  }
});

// Update a post
router.put('/:id', auth, async (req, res) => {
  try {
    const { content } = req.body;
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    // Check if the user is the author
    if (post.author.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to update this post' });
    }
    
    post.content = content || post.content;
    const updatedPost = await post.save();
    
    res.json(updatedPost);
  } catch (error) {
    console.error('Error updating post:', error);
    res.status(500).json({ message: 'Error updating post' });
  }
});

// Delete a post
router.delete('/:id', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    // Check if the user is the author
    if (post.author.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete this post' });
    }
    
    await post.remove();
    res.json({ message: 'Post removed' });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ message: 'Error deleting post' });
  }
});

// Like/Unlike a post
router.post('/:id/like', auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    // Check if the post has already been liked
    if (post.likes.includes(req.user.id)) {
      // Unlike the post
      post.likes = post.likes.filter(id => id.toString() !== req.user.id);
    } else {
      // Like the post
      post.likes.push(req.user.id);
    }
    
    await post.save();
    res.json({ likes: post.likes });
  } catch (error) {
    console.error('Error toggling like:', error);
    res.status(500).json({ message: 'Error toggling like' });
  }
});

// Add a comment to a post
router.post('/:id/comments', auth, async (req, res) => {
  try {
    const { content } = req.body;
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    const comment = {
      content,
      author: req.user.id,
      createdAt: new Date()
    };
    
    post.comments.unshift(comment);
    await post.save();
    
    // Populate author info in the response
    const populatedComment = {
      ...comment._doc,
      author: {
        _id: req.user.id,
        username: req.user.username,
        profilePic: req.user.profilePic
      }
    };
    
    res.status(201).json(populatedComment);
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ message: 'Error adding comment' });
  }
});

export default router;
