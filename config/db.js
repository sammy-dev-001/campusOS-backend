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

// Connect to MongoDB
const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MongoDB connection string is not defined. Please set MONGODB_URI environment variable.');
    }

    const isAtlas = process.env.MONGODB_URI.includes('mongodb+srv://');
    
    const options = {
      // Connection settings
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      family: 4,
      
      // Only set SSL options for Atlas connections
      ...(isAtlas ? {
        ssl: true,
        tlsAllowInvalidCertificates: true,
        tlsAllowInvalidHostnames: true
      } : {})
    };

    console.log(chalk.blue('🔌 Connecting to MongoDB...'));
    await mongoose.connect(process.env.MONGODB_URI, options);
    
    console.log(chalk.green(`✅ Connected to MongoDB: ${mongoose.connection.host}`));
    
    // Enable Mongoose query logging in development
    if (process.env.NODE_ENV === 'development') {
      mongoose.set('debug', { shell: true });
    }
    
    return mongoose.connection;
  } catch (error) {
    console.error(chalk.red(`❌ MongoDB connection error: ${error.message}`));
    console.error('Connection URI:', process.env.MONGODB_URI ? 'Provided' : 'Not provided');
    if (error.code) console.error('Error code:', error.code);
    if (error.codeName) console.error('Code name:', error.codeName);
    
    // If this is a connection error, retry after a delay
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
