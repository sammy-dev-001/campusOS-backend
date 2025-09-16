import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testMongoDBConnection() {
  try {
    console.log('🔌 Testing MongoDB connection...');
    
    // Simple connection options
    const options = {
      serverSelectionTimeoutMS: 5000, // 5 seconds timeout
      socketTimeoutMS: 10000, // 10 seconds socket timeout
    };

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, options);
    
    // Log connection status
    console.log('✅ MongoDB connected successfully!');
    console.log(`   - Host: ${mongoose.connection.host}`);
    console.log(`   - Port: ${mongoose.connection.port}`);
    console.log(`   - Database: ${mongoose.connection.name}`);
    
    // List all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('\n📋 Collections in database:');
    collections.forEach(collection => {
      console.log(`   - ${collection.name}`);
    });
    
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    
    // More detailed error handling
    if (error.name === 'MongooseServerSelectionError') {
      console.error('\n🔍 Troubleshooting Tips:');
      console.error('1. Check if your IP is whitelisted in MongoDB Atlas');
      console.error('2. Verify your connection string in .env file');
      console.error('3. Check your internet connection');
      console.error('4. Make sure MongoDB Atlas cluster is running');
    }
    
    process.exit(1);
  } finally {
    // Close the connection
    await mongoose.connection.close();
    console.log('\n🔌 MongoDB connection closed');
  }
}

// Run the test
testMongoDBConnection();
