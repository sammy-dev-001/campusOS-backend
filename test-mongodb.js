import { connectDB } from './config/db.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testConnection() {
  try {
    console.log('🔌 Testing MongoDB connection...');
    
    // Connect to MongoDB
    const connection = await connectDB();
    
    // Check connection status
    console.log('✅ MongoDB connected successfully');
    console.log(`   - Host: ${connection.host}`);
    console.log(`   - Port: ${connection.port}`);
    console.log(`   - Database: ${connection.name}`);
    
    // Test a simple query
    const collections = await connection.db.listCollections().toArray();
    console.log('\n📋 Collections in database:');
    collections.forEach(collection => {
      console.log(`   - ${collection.name}`);
    });
    
    // Test User model
    const User = mongoose.model('User');
    const userCount = await User.countDocuments();
    console.log(`\n👥 Total users: ${userCount}`);
    
    // Test Post model if it exists
    if ('Post' in mongoose.models) {
      const Post = mongoose.model('Post');
      const postCount = await Post.countDocuments();
      console.log(`📝 Total posts: ${postCount}`);
    }
    
    // Test Chat model if it exists
    if ('Chat' in mongoose.models) {
      const Chat = mongoose.model('Chat');
      const chatCount = await Chat.countDocuments();
      console.log(`💬 Total chats: ${chatCount}`);
    }
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Error testing MongoDB connection:', error);
    process.exit(1);
  } finally {
    // Close the connection
    await mongoose.connection.close();
    console.log('\n🔌 MongoDB connection closed');
  }
}

// Run the test
testConnection();
