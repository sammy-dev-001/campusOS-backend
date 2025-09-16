import { MongoClient } from 'mongodb';

// Direct connection with updated options
const uri = 'mongodb+srv://samueldaniyan564_db_user:XlSqNxNTU6Pfnl9M@cluster0.0ykmcom.mongodb.net/campusOS?retryWrites=true&w=majority';

const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  // Disable TLS/SSL for testing
  tls: false,
  tlsInsecure: true,
  // Force server selection to try each address
  directConnection: false,
  // Disable SRV resolution
  srvServiceName: 'mongodb',
  // Disable DNS resolution
  directConnection: true,
  // Force connection to primary
  readPreference: 'primary',
  // Authentication
  authMechanism: 'DEFAULT',
  authSource: 'admin',
  // Connection pool
  maxPoolSize: 1,
  minPoolSize: 0,
  maxIdleTimeMS: 10000,
  // Server selection
  serverSelectionTryOnce: false,
  // Timeouts
  connectTimeoutMS: 10000,
  heartbeatFrequencyMS: 10000,
  // Retry writes
  retryWrites: true,
  // Write concern
  w: 'majority',
  wtimeout: 10000,
  // Read concern
  readConcern: { level: 'local' },
  // Compression
  compressors: ['zlib'],
  zlibCompressionLevel: 3,
  // Logging
  loggerLevel: 'debug',
  // Monitoring
  monitorCommands: true
});

async function run() {
  try {
    console.log('🔌 Connecting to MongoDB Atlas...');
    await client.connect();
    console.log('✅ Successfully connected to MongoDB Atlas!');
    
    // List all databases
    const adminDb = client.db('admin');
    const dbs = await adminDb.admin().listDatabases();
    console.log('\n📋 Available databases:');
    dbs.databases.forEach(db => console.log(`   - ${db.name}`));
    
    // Test a simple query
    const db = client.db('campusOS');
    const collections = await db.listCollections().toArray();
    console.log('\n📋 Collections in campusOS:');
    collections.forEach(coll => console.log(`   - ${coll.name}`));
    
  } catch (err) {
    console.error('❌ Error:', err);
    
    if (err.name === 'MongoServerSelectionError') {
      console.error('\n🔍 Possible solutions:');
      console.error('1. Check if your IP is whitelisted in MongoDB Atlas');
      console.error('2. Verify your connection string is correct');
      console.error('3. Check your internet connection');
      console.error('4. Try disabling your firewall/antivirus temporarily');
    }
    
  } finally {
    await client.close();
    console.log('\n🔌 Connection closed');
  }
}

// Run the test
run();
