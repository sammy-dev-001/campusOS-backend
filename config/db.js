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

    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000, // Timeout after 10s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
      family: 4, // Use IPv4, skip trying IPv6
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    };

    await mongoose.connect(process.env.MONGODB_URI, options);
    
    // Connection successful, log the host
    console.log(chalk.blue(`MongoDB Connected: ${mongoose.connection.host}`));
    
    // Enable Mongoose query logging in development
    if (process.env.NODE_ENV === 'development') {
      mongoose.set('debug', { shell: true });
    }
    
    return mongoose.connection;
  } catch (error) {
    console.error(chalk.red(`❌ MongoDB connection error: ${error.message}`));
    
    // If this is a connection error, retry after a delay
    if (error.name === 'MongooseServerSelectionError') {
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
