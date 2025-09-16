import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.test
dotenv.config({ path: path.resolve(__dirname, '.env.test') });

async function testAtlasConnection() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is not defined in .env file');
    process.exit(1);
  }

  console.log('🔌 Testing MongoDB Atlas connection...');
  
  const client = new MongoClient(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000, // 10 seconds timeout
    socketTimeoutMS: 30000, // 30 seconds socket timeout
    connectTimeoutMS: 10000, // 10 seconds connection timeout
    maxPoolSize: 10,
    ssl: true,
    tlsAllowInvalidCertificates: false,
  });
  
  try {
    await client.connect();
    console.log('✅ Successfully connected to MongoDB Atlas!');
    
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
    console.error('\n❌ MongoDB Atlas connection error:', error.message);
    
    console.error('\n🔍 Troubleshooting Tips:');
    console.error('1. Verify your MongoDB Atlas credentials in .env file');
    console.error('2. Check if your IP is whitelisted in MongoDB Atlas Network Access');
    console.error('3. Ensure your cluster is running and accessible');
    console.error('4. Verify your internet connection');
    
    if (error.message.includes('bad auth')) {
      console.error('\n⚠️  Authentication failed. Please check your username and password.');
    } else if (error.message.includes('ETIMEDOUT')) {
      console.error('\n⚠️  Connection timed out. Check your internet connection and try again.');
    } else if (error.message.includes('ENOTFOUND')) {
      console.error('\n⚠️  Could not resolve host. Check your connection string and try again.');
    }
    
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n🔌 MongoDB connection closed');
  }
}

// Run the test
testAtlasConnection();
