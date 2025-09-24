import mongoose from 'mongoose';
import chalk from 'chalk';

// Enable debug mode in development
if (process.env.NODE_ENV === 'development') {
  mongoose.set('debug', (collectionName, method, query, doc) => {
    console.log(`\n${chalk.blue('MongoDB Query:')} ${chalk.green(collectionName)}.${chalk.yellow(method)}`);
    console.log(chalk.gray(JSON.stringify(query, null, 2)));
  });
}

// Connection events
mongoose.connection.on('connected', () => {
  console.log(chalk.green('✅ MongoDB connected successfully'));
});

mongoose.connection.on('error', (err) => {
  console.error(chalk.red(`❌ MongoDB connection error: ${err.message}`));
});

mongoose.connection.on('disconnected', () => {
  console.log(chalk.yellow('ℹ️  MongoDB disconnected'));
});

// Close the Mongoose connection when the Node process ends
const gracefulShutdown = async (msg, callback) => {
  try {
    await mongoose.connection.close();
    console.log(chalk.green(`\n✅ MongoDB disconnected through ${msg}`));
    callback();
  } catch (err) {
    console.error(chalk.red(`❌ Error disconnecting MongoDB: ${err.message}`));
    process.exit(1);
  }
};

// For nodemon restarts
process.once('SIGUSR2', () => {
  gracefulShutdown('nodemon restart', () => {
    process.kill(process.pid, 'SIGUSR2');
  });
});

// For app termination
process.on('SIGINT', () => {
  gracefulShutdown('app termination', () => {
    process.exit(0);
  });
});

// For Heroku app termination
process.on('SIGTERM', () => {
  gracefulShutdown('Heroku app termination', () => {
    process.exit(0);
  });
});

// MongoDB connection settings and state
const mongoOptions = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  family: 4,
  retryWrites: true,
  w: 'majority',
  // Enable retry for all operations
  retryReads: true,
};

// Connection state tracking
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_INTERVAL = 5000; // 5 seconds

// Configure MongoDB connection with auto-reconnect
const configureMongoOptions = () => {
  const isAtlas = process.env.MONGODB_URI?.includes('mongodb+srv://');
  
  const options = {
    ...mongoOptions,
    // Common options for all environments
    serverSelectionTimeoutMS: 30000, // 30 seconds
    socketTimeoutMS: 45000, // 45 seconds
  };

  // Only set SSL/TLS options for Atlas connections
  if (isAtlas) {
    return {
      ...options,
      // Use either tls or ssl, not both
      tls: true,
      tlsAllowInvalidCertificates: false,
      tlsAllowInvalidHostnames: false,
      // Connection settings
      connectTimeoutMS: 30000,
      heartbeatFrequencyMS: 10000,
      retryWrites: true,
      w: 'majority',
      // Use new URL parser and unified topology
      useNewUrlParser: true,
      useUnifiedTopology: true
    };
  }
  
  return options;
};

// Handle MongoDB connection events
const setupConnectionHandlers = (connection) => {
  connection.on('connected', () => {
    isConnected = true;
    reconnectAttempts = 0; // Reset reconnect attempts on successful connection
    console.log(chalk.green('✅ MongoDB connected successfully'));
  });

  connection.on('error', (err) => {
    console.error(chalk.red(`❌ MongoDB connection error: ${err.message}`));
    isConnected = false;
  });

  connection.on('disconnected', () => {
    console.log(chalk.yellow('ℹ️  MongoDB disconnected'));
    isConnected = false;
    attemptReconnect();
  });

  connection.on('reconnected', () => {
    console.log(chalk.green('♻️  MongoDB reconnected'));
    isConnected = true;
  });
};

// Attempt to reconnect to MongoDB
const attemptReconnect = async () => {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error(chalk.red(`❌ Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached.`));
    return;
  }

  reconnectAttempts++;
  console.log(chalk.yellow(`⚠️  Attempting to reconnect to MongoDB (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`));

  try {
    await mongoose.connect(process.env.MONGODB_URI, configureMongoOptions());
  } catch (error) {
    console.error(chalk.red(`❌ Reconnection attempt ${reconnectAttempts} failed: ${error.message}`));
    // Schedule next reconnection attempt
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      setTimeout(attemptReconnect, RECONNECT_INTERVAL);
    }
  }
};

// Connect to MongoDB with auto-reconnect
const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MongoDB connection string is not defined. Please set MONGODB_URI environment variable.');
    }

    console.log(chalk.blue('🔌 Connecting to MongoDB...'));
    
    // Configure connection options
    const options = configureMongoOptions();
    
    // Set up event handlers
    setupConnectionHandlers(mongoose.connection);
    
    // Enable Mongoose query logging in development
    if (process.env.NODE_ENV === 'development') {
      mongoose.set('debug', { shell: true });
    }
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, options);
    
    return mongoose.connection;
  } catch (error) {
    console.error(chalk.red(`❌ Initial MongoDB connection failed: ${error.message}`));
    console.error('Connection URI:', process.env.MONGODB_URI ? 'Provided' : 'Not provided');
    if (error.code) console.error('Error code:', error.code);
    if (error.codeName) console.error('Code name:', error.codeName);
    
    // Start reconnection attempts
    if (error.name === 'MongooseServerSelectionError' || error.name === 'MongoServerSelectionError') {
      console.log(chalk.yellow('Retrying connection in 5 seconds...'));
      await new Promise(resolve => setTimeout(resolve, 5000));
      return connectDB();
    }
    
    // For other errors, exit the process
    process.exit(1);
  }
};

export { connectDB };
export default connectDB;
