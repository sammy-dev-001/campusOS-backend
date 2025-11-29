import bcrypt from 'bcryptjs';
import { v2 as cloudinary } from 'cloudinary';
import { Expo } from 'expo-server-sdk';
import express from 'express';
import { auth } from '../middleware/auth.js';
import Post from '../models/Post.js';
import User from '../models/User.js';

const router = express.Router();
const expo = new Expo();

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

// Search users
router.get('/search', auth, async (req, res) => {
  // Log the start of the search request
  console.log('[Search] Starting user search with query:', req.query);
  
  try {
    // Validate input
    const { q } = req.query;
    
    if (!q || typeof q !== 'string') {
      console.log('[Search] Invalid or missing search query');
      return res.status(400).json({ 
        success: false,
        message: 'A valid search query is required',
        code: 'INVALID_QUERY'
      });
    }
    
    const searchTerm = q.trim();
    if (searchTerm.length < 2) {
      console.log('[Search] Search term too short');
      return res.status(400).json({
        success: false,
        message: 'Search term must be at least 2 characters long',
        code: 'QUERY_TOO_SHORT'
      });
    }
    
    console.log(`[Search] Validated search term: "${searchTerm}"`);
    
    // Verify the requesting user exists and is valid
    try {
      const requestingUser = await User.findById(req.user.id).select('_id').lean();
      if (!requestingUser) {
        console.error(`[Search] Requesting user not found: ${req.user.id}`);
        return res.status(404).json({ 
          success: false,
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }
    } catch (userError) {
      console.error('[Search] Error validating requesting user:', {
        error: userError.message,
        stack: userError.stack,
        userId: req.user.id
      });
      
      return res.status(500).json({ 
        success: false,
        message: 'Error validating user session',
        code: 'SESSION_VALIDATION_ERROR',
        error: process.env.NODE_ENV === 'development' ? userError.message : undefined
      });
    }
    
    // Build a safe search query
    const searchQuery = {
      $and: [
        {
          $or: [
            { username: { $regex: searchTerm, $options: 'i' } },
            { email: { $regex: searchTerm, $options: 'i' } },
            { displayName: { $regex: searchTerm, $options: 'i' } }
          ]
        },
        { _id: { $ne: req.user.id } } // Exclude current user
      ]
    };
    
    console.log('[Search] Executing database query:', JSON.stringify({
      query: searchQuery,
      userId: req.user.id
    }, null, 2));
    
    // Execute search with error handling
    let users;
    try {
      users = await User.find(searchQuery)
        .select('_id username profilePic displayName email')
        .limit(20)
        .lean();
        
      console.log(`[Search] Found ${users.length} matching users`);
      
    } catch (dbError) {
      console.error('[Search] Database query failed:', {
        error: dbError.message,
        stack: dbError.stack,
        query: searchQuery
      });
      
      return res.status(500).json({
        success: false,
        message: 'Error searching users',
        code: 'DATABASE_ERROR',
        error: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      });
    }
    
    // Sanitize and format response
    const sanitizedUsers = users.map(user => ({
      id: user._id,
      username: user.username,
      displayName: user.displayName || user.username,
      email: user.email,
      profilePicture: user.profilePic
    }));
    
    console.log('[Search] Search completed successfully');
    
    return res.json({
      success: true,
      count: sanitizedUsers.length,
      results: sanitizedUsers
    });
    
  } catch (error) {
    // Catch any unexpected errors
    console.error('[Search] Unexpected error:', {
      message: error.message,
      stack: error.stack,
      query: req.query,
      userId: req.user?.id,
      timestamp: new Date().toISOString()
    });
    
    // Handle specific error types
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid search parameters',
        code: 'INVALID_PARAMETERS',
        details: error.message 
      });
    }
    
    // Default error response
    return res.status(500).json({
      success: false,
      message: 'An unexpected error occurred while searching',
      code: 'INTERNAL_SERVER_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get user profile by ID or username
router.get('/:id', auth, async (req, res) => {
  try {
    // Skip if the ID is 'search' to prevent conflict with the search endpoint
    if (req.params.id === 'search') {
      return res.status(400).json({ message: 'Invalid user ID' });
    }
    
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

// Update user's push token
router.post('/:userId/push-token', auth, async (req, res) => {
  try {
    const { pushToken } = req.body;
    
    if (!pushToken) {
      return res.status(400).json({ 
        success: false, 
        message: 'Push token is required' 
      });
    }

    // Validate the push token format
    if (!Expo.isExpoPushToken(pushToken)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid push token format' 
      });
    }

    // Update the user's push token
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { pushToken },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    res.json({ 
      success: true, 
      message: 'Push token updated successfully' 
    });
  } catch (error) {
    console.error('Error updating push token:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating push token',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
