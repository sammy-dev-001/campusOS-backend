import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testLocalConnection() {
  // Use a local MongoDB instance for testing
  const localMongoURI = 'mongodb://localhost:27017/campusOS';
  
  console.log('🔌 Testing local MongoDB connection...');
  
  const client = new MongoClient(localMongoURI, {
    serverSelectionTimeoutMS: 5000, // 5 seconds timeout
    socketTimeoutMS: 10000, // 10 seconds socket timeout
  });
  
  try {
    await client.connect();
    console.log('✅ Successfully connected to local MongoDB!');
    
    // List all databases
    const adminDb = client.db('admin');
    const dbs = await adminDb.admin().listDatabases();
    
    console.log('\n📋 Available databases:');
    dbs.databases.forEach(db => {
      console.log(`   - ${db.name}`);
    });
    
    // List collections in the campusOS database
    const db = client.db('campusOS');
    const collections = await db.listCollections().toArray();
    
    console.log('\n📋 Collections in campusOS database:');
    collections.forEach(collection => {
      console.log(`   - ${collection.name}`);
    });
    
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    
    console.error('\n🔍 Troubleshooting Tips:');
    console.error('1. Make sure MongoDB is running locally');
    console.error('2. Check if the default port 27017 is correct');
    console.error('3. Try running: mongod --version to check MongoDB installation');
    
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n🔌 MongoDB connection closed');
  }
}

// Run the test
testLocalConnection();
