import { MongoClient } from 'mongodb';

// Direct connection string - replace with your actual credentials
const uri = 'mongodb+srv://samueldaniyan564_db_user:XlSqNxNTU6Pfnl9M@cluster0.0ykmcom.mongodb.net/campusOS?retryWrites=true&w=majority';

async function testConnection() {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });

  try {
    console.log('🔌 Attempting to connect to MongoDB Atlas...');
    await client.connect();
    console.log('✅ Successfully connected to MongoDB Atlas!');
    
    // List databases
    const adminDb = client.db('admin');
    const dbs = await adminDb.admin().listDatabases();
    console.log('\n📋 Available databases:');
    dbs.databases.forEach(db => console.log(`   - ${db.name}`));
    
    return true;
  } catch (error) {
    console.error('❌ Connection error:', error.message);
    return false;
  } finally {
    await client.close();
    console.log('\n🔌 Connection closed');
  }
}

// Run the test
testConnection().then(success => {
  process.exit(success ? 0 : 1);
});
