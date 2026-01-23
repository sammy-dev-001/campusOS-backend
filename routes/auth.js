import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

// Register a new user
const registerUser = async (req, res) => {
  try {
    console.log('Received request body:', req.body);
    console.log('Request headers:', req.headers);


    const { username, email, password, displayName, fullName, university, level, course } = req.body;

    console.log('Parsed signup request:', {
      username,
      email,
      hasPassword: !!password,
      displayName,
      fullName,
      university,
      level,
      course
    });

    // Validate required fields
    if (!username || !email || !password || !displayName || !fullName || !university || !level || !course) {
      const missingFields = [];
      if (!username) missingFields.push('username');
      if (!email) missingFields.push('email');
      if (!password) missingFields.push('password');
      if (!displayName) missingFields.push('displayName');
      if (!fullName) missingFields.push('fullName');
      if (!university) missingFields.push('university');
      if (!level) missingFields.push('level');
      if (!course) missingFields.push('course');

      console.error('Missing required fields:', missingFields);
      return res.status(400).json({
        message: 'All fields are required',
        missingFields
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      console.log('User already exists:', {
        email: existingUser.email === email ? email : null,
        username: existingUser.username === username ? username : null
      });
      return res.status(400).json({
        message: 'User already exists',
        field: existingUser.email === email ? 'email' : 'username'
      });
    }

    // Create new user
    let user;
    try {
      user = new User({
        username,
        email,
        password, // Let the pre-save hook handle hashing
        displayName: displayName || username,
        fullName: fullName || displayName || username,
        university: university || '',
        level: level || '',
        course: course || ''
      });

      await user.save();
      console.log('User created successfully:', { userId: user._id, email: user.email });
    } catch (error) {
      console.error('Error creating user:', error);
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({
          message: 'Validation failed',
          errors
        });
      }
      throw error;
    }

    // Generate JWT token
    let token;
    try {
      token = jwt.sign(
        { id: user._id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      console.log('JWT token generated for user:', user._id);
    } catch (error) {
      console.error('Error generating JWT token:', error);
      return res.status(500).json({
        message: 'Error generating authentication token',
        error: error.message
      });
    }

    // Prepare response
    const userResponse = {
      id: user._id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      fullName: user.fullName,
      profilePic: user.profilePic,
      university: user.university,
      level: user.level,
      course: user.course
    };

    console.log('Registration successful:', userResponse);
    res.status(201).json({
      user: userResponse,
      token,
      message: 'User registered successfully'
    });
  } catch (error) {
    console.error('Registration error:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });

    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        message: `${field} already exists`,
        field,
        value: error.keyValue[field]
      });
    }

    res.status(500).json({
      message: 'Error registering user',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Register routes for both /register and /signup
router.post('/register', registerUser);
router.post('/signup', registerUser);

// Debug endpoint to list all available routes
router.get('/routes', (req, res) => {
  const routes = [];
  router.stack.forEach((middleware) => {
    if (middleware.route) {
      // Routes registered directly on the router
      const methods = Object.keys(middleware.route.methods);
      routes.push({
        path: `/api/auth${middleware.route.path}`,
        methods,
        type: 'direct'
      });
    } else if (middleware.name === 'router') {
      // Nested routes from router.use()
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          const methods = Object.keys(handler.route.methods);
          routes.push({
            path: `/api/auth${handler.route.path}`,
            methods,
            type: 'nested'
          });
        }
      });
    }
  });

  res.json({
    status: 'success',
    results: routes.length,
    data: {
      routes
    }
  });
});

// Log all available routes on server start
console.log('Available auth routes:');
router.stack.forEach((r) => {
  if (r.route && r.route.path) {
    console.log(`- ${Object.keys(r.route.methods).map(m => m.toUpperCase()).join('|')} /api/auth${r.route.path}`);
  }
});

// User login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists - explicitly include password field
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      console.log('No user found with email:', email);
      return res.status(400).json({
        message: 'No account found with this email address',
        errorType: 'email'
      });
    }

    // Check password using the correct method signature
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('Password mismatch for user:', email);
      return res.status(400).json({
        message: 'Incorrect password',
        errorType: 'password'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        fullName: user.fullName,
        profilePic: user.profilePic,
      },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error logging in' });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
});

// Forgot Password - Request reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      // For security, don't reveal if email exists or not
      return res.json({
        message: 'If an account exists with this email, you will receive password reset instructions.'
      });
    }

    // Generate a 6-digit reset code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const resetExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Save reset code to user
    user.resetPasswordCode = resetCode;
    user.resetPasswordExpiry = resetExpiry;
    await user.save();

    // In production, send email with nodemailer here
    // For now, log the code (remove in production!)
    console.log(`Password reset code for ${email}: ${resetCode}`);

    res.json({
      message: 'If an account exists with this email, you will receive password reset instructions.',
      // Remove this in production - only for testing
      debug_code: process.env.NODE_ENV === 'development' ? resetCode : undefined
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Error processing request' });
  }
});

// Reset Password - Verify code and set new password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: 'Email, reset code, and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const user = await User.findOne({
      email: email.toLowerCase(),
      resetPasswordCode: code,
      resetPasswordExpiry: { $gt: new Date() }
    }).select('+password +resetPasswordCode +resetPasswordExpiry');

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset code' });
    }

    // Update password (the pre-save hook will hash it)
    user.password = newPassword;
    user.resetPasswordCode = undefined;
    user.resetPasswordExpiry = undefined;
    await user.save();

    res.json({ message: 'Password reset successful. You can now log in with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Error resetting password' });
  }
});

export default router;
