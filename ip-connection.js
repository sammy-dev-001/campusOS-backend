import { MongoClient } from 'mongodb';

// Using direct IP connection to bypass DNS resolution
async function testIPConnection() {
  // Get the IP address for cluster0.0ykmcom.mongodb.net
  // You can find this by pinging the hostname or checking MongoDB Atlas
  const host = '34.200.32.187'; // Example IP, replace with actual IP from your MongoDB Atlas cluster
  const uri = `mongodb://samueldaniyan564_db_user:XlSqNxNTU6Pfnl9M@${host}/campusOS?retryWrites=true&w=majority`;
  
  console.log('🔌 Attempting to connect using direct IP...');
  
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 10000,
    directConnection: true,
    tls: true,
    tlsInsecure: true,
    authMechanism: 'SCRAM-SHA-1',
    authSource: 'admin'
  });
  
  try {
    await client.connect();
    console.log('✅ Successfully connected to MongoDB using direct IP!');
    
    // Test a simple command
    const db = client.db('campusOS');
    const collections = await db.listCollections().toArray();
    console.log('\n📋 Collections:');
    collections.forEach(c => console.log(`- ${c.name}`));
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.error('Error details:', {
      name: error.name,
      code: error.code,
      errorLabels: error.errorLabels,
      stack: error.stack
    });
  } finally {
    await client.close();
    console.log('\n🔌 Connection closed');
  }
}

testIPConnection();
