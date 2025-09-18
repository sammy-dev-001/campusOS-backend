import express from 'express';
import { auth } from '../middleware/auth.js';
import User from '../models/User.js';
import Post from '../models/Post.js';
import bcrypt from 'bcryptjs';
import { v2 as cloudinary } from 'cloudinary';

const router = express.Router();

// Get current user profile
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Error fetching user profile' });
  }
});

// Get user profile by ID or username
router.get('/:id', auth, async (req, res) => {
  try {
    const user = await User.findOne({
      $or: [
        { _id: req.params.id },
        { username: req.params.id }
      ]
    }).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Error fetching user' });
  }
});

// Update user profile
router.put('/me', auth, async (req, res) => {
  try {
    const { username, email, bio, currentPassword, newPassword } = req.body;
    const updates = {};
    
    // Basic profile updates
    if (username) updates.username = username;
    if (email) updates.email = email;
    if (bio !== undefined) updates.bio = bio;
    
    // Handle password change if requested
    if (currentPassword && newPassword) {
      const user = await User.findById(req.user.id);
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      
      if (!isMatch) {
        return res.status(400).json({ message: 'Current password is incorrect' });
      }
      
      const salt = await bcrypt.genSalt(10);
      updates.password = await bcrypt.hash(newPassword, salt);
    }
    
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');
    
    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating profile:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Username or email already in use' });
    }
    res.status(500).json({ message: 'Error updating profile' });
  }
});

// Update profile picture
router.post('/me/avatar', auth, async (req, res) => {
  try {
    const { image } = req.body;
    
    if (!image) {
      return res.status(400).json({ message: 'No image provided' });
    }
    
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(image, {
      folder: 'campusos/profiles',
      width: 500,
      height: 500,
      crop: 'fill',
      gravity: 'face'
    });
    
    // Update user's profile picture
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { profilePic: result.secure_url },
      { new: true }
    ).select('-password');
    
    res.json(user);
  } catch (error) {
    console.error('Error updating profile picture:', error);
    res.status(500).json({ message: 'Error updating profile picture' });
  }
});

// Get user's profile picture
router.get('/:id/profile-picture', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('profilePic');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (!user.profilePic) {
      return res.status(404).json({ message: 'Profile picture not found' });
    }
    
    res.json({ profilePicture: user.profilePic });
  } catch (error) {
    console.error('Error fetching profile picture:', error);
    res.status(500).json({ message: 'Error fetching profile picture' });
  }
});

// Get user's posts
router.get('/:id/posts', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const posts = await Post.find({ author: req.params.id })
      .populate('author', 'username profilePic')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await Post.countDocuments({ author: req.params.id });
    
    res.json({
      posts,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Error fetching user posts:', error);
    res.status(500).json({ message: 'Error fetching user posts' });
  }
});

// Search users
router.get('/search', auth, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ message: 'Search query is required' });
    }
    
    const users = await User.find({
      $or: [
        { username: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { displayName: { $regex: q, $options: 'i' } }
      ],
      _id: { $ne: req.user.id } // Exclude current user
    }).select('username profilePic displayName');
    
    res.json(users);
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ message: 'Error searching users' });
  }
});

// Follow/Unfollow user
router.post('/:id/follow', auth, async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ message: 'You cannot follow yourself' });
    }
    
    const userToFollow = await User.findById(req.params.id);
    const currentUser = await User.findById(req.user.id);
    
    if (!userToFollow) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if already following
    const isFollowing = currentUser.following.includes(userToFollow._id);
    
    if (isFollowing) {
      // Unfollow
      await User.findByIdAndUpdate(req.user.id, {
        $pull: { following: userToFollow._id }
      });
      
      await User.findByIdAndUpdate(userToFollow._id, {
        $pull: { followers: req.user.id }
      });
      
      res.json({ message: 'User unfollowed' });
    } else {
      // Follow
      await User.findByIdAndUpdate(req.user.id, {
        $addToSet: { following: userToFollow._id }
      });
      
      await User.findByIdAndUpdate(userToFollow._id, {
        $addToSet: { followers: req.user.id }
      });
      
      // TODO: Send notification to the followed user
      
      res.json({ message: 'User followed' });
    }
  } catch (error) {
    console.error('Error following user:', error);
    res.status(500).json({ message: 'Error following user' });
  }
});

// Get user's followers
router.get('/:id/followers', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('followers')
      .populate('followers', 'username profilePic');
      
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user.followers);
  } catch (error) {
    console.error('Error fetching followers:', error);
    res.status(500).json({ message: 'Error fetching followers' });
  }
});

// Get users the user is following
router.get('/:id/following', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('following')
      .populate('following', 'username profilePic');
      
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user.following);
  } catch (error) {
    console.error('Error fetching following:', error);
    res.status(500).json({ message: 'Error fetching following' });
  }
});

export default router;
