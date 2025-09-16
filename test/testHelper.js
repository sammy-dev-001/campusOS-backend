import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '../config/db.js';

dotenv.config({ path: '.env.test' });

// Test database connection
const connectTestDB = async () => {
  try {
    await connectDB();
    console.log('✅ Test database connected');
  } catch (error) {
    console.error('❌ Test database connection error:', error);
    process.exit(1);
  }
};

// Clear test database
const clearTestDB = async () => {
  try {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
    console.log('🧹 Test database cleared');
  } catch (error) {
    console.error('❌ Error clearing test database:', error);
  }
};

// Close test database connection
const closeTestDB = async () => {
  try {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    console.log('👋 Test database connection closed');
  } catch (error) {
    console.error('❌ Error closing test database:', error);
  }
};

export {
  connectTestDB,
  clearTestDB,
  closeTestDB
};
