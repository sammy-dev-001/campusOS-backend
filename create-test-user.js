import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from './models/User.js';
import dotenv from 'dotenv';

dotenv.config();

async function createTestUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/campusos');
    console.log('Connected to MongoDB');
    
    // Hash the password
    const hashedPassword = await bcrypt.hash('test1234', 12);
    
    // Create test user
    const user = new User({
      email: 'test@example.com',
      password: hashedPassword,
      username: 'testuser',
      displayName: 'Test User',
      fullName: 'Test User',
      emailVerified: true
    });
    
    // Save the user
    await user.save();
    console.log('✅ Test user created successfully!');
    
    // Close the connection
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating test user:', error);
    process.exit(1);
  }
}

// Run the function
createTestUser();
