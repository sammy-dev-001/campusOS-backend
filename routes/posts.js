import { v2 as cloudinary } from 'cloudinary';
import express from 'express';
import multer from 'multer';
import { auth } from '../middleware/auth.js';
import Post from '../models/Post.js';

const router = express.Router();

// Create a new post
// Multer setup for single file upload (image or video)
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post('/', auth, upload.single('media'), async (req, res) => {
  try {
    const { content } = req.body;
    let mediaUrl = null;

    if (req.file) {
      // Upload to Cloudinary
      const result = await cloudinary.uploader.upload_stream(
        { resource_type: 'auto' },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            return res.status(500).json({ message: 'Cloudinary upload failed' });
          }
          mediaUrl = result.secure_url;
          createAndSavePost();
        }
      );
      // Write file buffer to stream
      result.end(req.file.buffer);
    } else {
      createAndSavePost();
    }

    async function createAndSavePost() {
      const post = new Post({
        content,
        author: req.user.id,
        media: mediaUrl ? [mediaUrl] : [],
      });
      await post.save();
      await post.populate('author', 'username profilePic');
      res.status(201).json(post);
    }
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ message: 'Error creating post' });
  }
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
