import { MongoClient } from 'mongodb';

// Minimal connection test
async function testConnection() {
  const uri = 'mongodb+srv://samueldaniyan564_db_user:XlSqNxNTU6Pfnl9M@cluster0.0ykmcom.mongodb.net/campusOS?retryWrites=true&w=majority';
  
  console.log('🔌 Attempting to connect...');
  
  try {
    const client = await MongoClient.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 10000,
      maxIdleTimeMS: 10000,
      waitQueueTimeoutMS: 10000
    });
    
    console.log('✅ Connected successfully!');
    await client.close();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  }
}

testConnection();
