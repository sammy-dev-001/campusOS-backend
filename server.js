import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import xss from 'xss-clean';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { WebSocketService } from './services/websocket.js';
import { connectDB } from './config/db.js';
import globalErrorHandler from './middleware/errorHandler.js';
import AppError from './utils/appError.js';

// Import models - This ensures models are registered with Mongoose
import './models/User.js';
import './models/Post.js';
import './models/Chat.js';

// Import routes
import authRoutes from './routes/auth.js';
import postRoutes from './routes/posts.js';
import chatRoutes from './routes/chats.js';
import userRoutes from './routes/users.js';
import announcementRoutes from './routes/announcementRoutes.js';
import tutorRoutes from './routes/tutorRoutes.js';
import timetableRoutes from './routes/timetableRoutes.js';
import pollRoutes from './routes/polls.js';
import healthRoutes from './routes/health.js';

// Get the current file and directory names
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check for required environment variables
const requiredEnvVars = [
  'MONGODB_URI',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

// Initialize express app
const app = express();

// Create HTTP server
const httpServer = createServer(app);

// Trust proxy for production
app.enable('trust proxy');

// Set security HTTP headers
app.use(helmet());

// Configure CORS
const corsOptions = {
  origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 600 // 10 minutes
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Trust proxy for rate limiting behind load balancer
app.set('trust proxy', 1); // Trust first proxy

// Limit requests from same API
const limiter = rateLimit({
  max: 1000, // 1000 requests per hour
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many requests from this IP, please try again in an hour!',
  validate: { trustProxy: false } // Disable trust proxy validation for rate limiting
});
app.use('/api', limiter);

// Body parser, reading data from body into req.body
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Data sanitization against XSS
app.use(xss());

// Prevent parameter pollution
app.use(hpp({
  whitelist: [
    'duration', 'ratingsQuantity', 'ratingsAverage', 'maxGroupSize', 'difficulty', 'price'
  ]
}));

// Serving static files
app.use(express.static(path.join(__dirname, 'public')));

// Compression middleware
app.use(compression());

// Initialize Socket.IO with enhanced configuration
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true
  },
  // Enable connection state recovery
  connectionStateRecovery: {
    // The backup duration of the sessions and the packets
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    // Skip middlewares upon successful recovery
    skipMiddlewares: true,
  },
  // Enable per-message deflation
  perMessageDeflate: {
    zlibDeflateOptions: {
      // See zlib defaults
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    // Other options
    clientNoContextTakeover: true, // Defaults to negotiated value
    serverNoContextTakeover: true, // Defaults to negotiated value
    serverMaxWindowBits: 10, // Defaults to negotiated value
    concurrencyLimit: 10, // Limits zlib concurrency for performance
    threshold: 1024 // Size (in bytes) below which messages should not be compressed
  },
  // Enable HTTP long-polling as fallback
  transports: ['websocket', 'polling'],
  // Enable HTTP compression
  httpCompression: true,
  // Maximum size of the HTTP request body
  maxHttpBufferSize: 1e8 // 100MB
});

// Initialize WebSocket service
const webSocketService = new WebSocketService(io);
app.set('webSocketService', webSocketService);

// Configure Cloudinary with enhanced error handling
const configureCloudinary = () => {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      throw new Error('Missing required Cloudinary configuration');
    }

    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true
    });

    // Test Cloudinary connection
    cloudinary.api.ping({}, (error) => {
      if (error) {
        console.error('❌ Cloudinary connection test failed:', error.message);
      } else {
        console.log('✅ Cloudinary connected successfully');
      }
    });
  } catch (error) {
    console.error('❌ Failed to configure Cloudinary:', error.message);
    // Don't crash the app if Cloudinary fails to configure
    console.log('⚠️  Cloudinary will be disabled. File uploads will not work.');
  }
};

// Initialize Cloudinary
configureCloudinary();

// Create storage engines for different types of uploads
const createCloudinaryStorage = (folder, resourceType = 'auto') => {
  return new CloudinaryStorage({
    cloudinary,
    params: (req, file) => {
      // Generate a unique filename
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const originalName = file.originalname.split('.');
      const extension = originalName[originalName.length - 1];
      const filename = `${originalName[0].substring(0, 100)}-${uniqueSuffix}.${extension}`;
      
      return {
        folder: `campusOS/${folder}`,
        public_id: filename,
        resource_type: resourceType,
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'mp4', 'mov', 'webm', 'pdf', 'doc', 'docx', 'txt'],
        format: extension,
        transformation: [
          { width: 2000, crop: 'limit', quality: 'auto' },
          { fetch_format: 'auto' }
        ]
      };
    }
  });
};

// File filter for images
const imageFileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(new AppError('Not an image! Please upload only images.', 400), false);
  }
};

// File filter for videos
const videoFileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('video')) {
    cb(null, true);
  } else {
    cb(new AppError('Not a video! Please upload only videos.', 400), false);
  }
};

// Configure multer uploads with different settings for different file types
const profilePicUpload = multer({
  storage: createCloudinaryStorage('profile_pictures', 'image'),
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const postUpload = multer({
  storage: createCloudinaryStorage('posts'),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image') || file.mimetype.startsWith('video')) {
      cb(null, true);
    } else {
      cb(new AppError('Not an image or video! Please upload only images or videos.', 400), false);
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

const documentUpload = multer({
  storage: createCloudinaryStorage('documents', 'raw'),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('application/pdf') || 
        file.mimetype.includes('document') || 
        file.mimetype.includes('text')) {
      cb(null, true);
    } else {
      cb(new AppError('Not a supported document format!', 400), false);
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

// Make upload middlewares available to routes
app.set('profilePicUpload', profilePicUpload);
app.set('postUpload', postUpload);
app.set('documentUpload', documentUpload);

// Add Cloudinary to app locals for direct access in routes
app.locals.cloudinary = cloudinary;

// API Routes
const API_PREFIX = '/api/v1';

// Root route
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Welcome to CampusOS API',
    documentation: 'https://github.com/sammy-dev-001/campusOS-backend',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get(['/health', `${API_PREFIX}/health`], (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const isHealthy = dbStatus === 'connected';
  
  const healthCheck = {
    status: isHealthy ? 'ok' : 'error',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatus,
      url: process.env.MONGODB_URI ? 
           process.env.MONGODB_URI.replace(/\/.*@/, '/***@') : 'not configured',
      ping: mongoose.connection.db ? 'available' : 'unavailable'
    },
    services: {
      cloudinary: !!cloudinary.config().cloud_name,
      websocket: webSocketService ? 'running' : 'not running'
    },
    environment: process.env.NODE_ENV || 'development',
    memory: {
      rss: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB`,
      heapUsed: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`
    },
    node: {
      version: process.version,
      platform: process.platform,
      pid: process.pid
    }
  };
  
  res.status(isHealthy ? 200 : 503).json(healthCheck);
});

// Mount API routes with versioning
app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/posts`, postRoutes);
app.use(`${API_PREFIX}/chats`, chatRoutes);
app.use(`${API_PREFIX}/users`, userRoutes);
app.use(`${API_PREFIX}/announcements`, announcementRoutes);
app.use(`${API_PREFIX}/tutors`, tutorRoutes);
app.use(`${API_PREFIX}/timetables`, timetableRoutes);
app.use(`${API_PREFIX}/polls`, pollRoutes);
app.use(`${API_PREFIX}/health`, healthRoutes);

// Mount non-versioned API routes for backward compatibility
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/users', userRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/tutors', tutorRoutes);
app.use('/api/timetables', timetableRoutes);
app.use('/api/polls', pollRoutes);
app.use('/api/health', healthRoutes);

// Root health check endpoint
app.get('/health', (req, res) => {
  res.redirect(`${API_PREFIX}/health`);
});

// 404 handler for API routes
app.all(`${API_PREFIX}/*`, (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global error handler
app.use((err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', err);
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      stack: err.stack,
      error: err
    });
  } else {
    // Production error handling
    if (err.isOperational) {
      res.status(err.statusCode).json({
        status: err.status,
        message: err.message
      });
    } else {
      console.error('ERROR 💥', err);
      res.status(500).json({
        status: 'error',
        message: 'Something went very wrong!'
      });
    }
  }
});

// Handle 404 for API routes
app.use('/api/*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Handle 404 - Not Found
app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global error handling middleware
app.use(globalErrorHandler);

// Server state management
const serverState = {
  isShuttingDown: false,
  activeConnections: new Set(),
  
  // Track active connections
  trackConnections(server) {
    server.on('connection', (connection) => {
      this.activeConnections.add(connection);
      connection.on('close', () => {
        this.activeConnections.delete(connection);
      });
    });
  },
  
  // Close all active connections
  closeConnections() {
    console.log('Closing all active connections...');
    this.activeConnections.forEach(connection => {
      connection.destroy();
      this.activeConnections.delete(connection);
    });
  },
  
  // Graceful shutdown handler
  async gracefulShutdown() {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    
    console.log('Shutting down gracefully...');
    
    try {
      // Close HTTP server
      await new Promise((resolve) => httpServer.close(() => {
        console.log('HTTP server closed');
        resolve();
      }));
      
      // Close MongoDB connection
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close(false);
        console.log('MongoDB connection closed');
      }
      
      // Close WebSocket connections
      if (webSocketService) {
        webSocketService.io.close();
        console.log('WebSocket server closed');
      }
      
      // Close any remaining connections
      this.closeConnections();
      
      console.log('Shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
};

// Alias for backward compatibility
const gracefulShutdown = serverState.gracefulShutdown.bind(serverState);

// Start server with enhanced error handling
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Server state is now managed by the serverState object

// Log unhandled rejections with more details
process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌ UNHANDLED REJECTION!');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  
  // Log stack trace if available
  if (reason instanceof Error) {
    console.error('Stack:', reason.stack);
  }
  
  // Never shut down, just log the error
  console.log('⚠️  Server kept alive despite unhandled rejection');
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('\n❌ UNCAUGHT EXCEPTION!');
  console.error('Error:', error);
  console.error('Stack:', error.stack);
  
  // Log to external service if needed
  // ...
  
  // Keep the process alive
  console.log('⚠️  Server kept alive despite uncaught exception');
  return true; // Prevents default exit
});

// Handle any uncaught promise rejections that might still cause exit
process.on('rejectionHandled', (promise) => {
  console.log('A promise rejection was handled asynchronously');
});

// Handle process warnings
process.on('warning', (warning) => {
  console.warn('Process Warning:', warning);
});

// Handle termination signals
['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
  process.on(signal, () => {
    console.log(`${signal} received. Starting graceful shutdown...`);
    gracefulShutdown();
  });
});

// Start the application
const startServer = async () => {
  try {
    console.log('🔍 Starting server initialization...');
    
    // Connect to MongoDB with retry logic
    try {
      console.log('🔗 Connecting to MongoDB...');
      await connectDB();
      console.log('✅ MongoDB connected successfully');
    } catch (dbError) {
      console.error('❌ Failed to connect to MongoDB:', dbError.message);
      // Don't exit immediately, allow the server to start in a degraded state
      console.log('⚠️  Running in degraded mode without database connection');
    }

    // Create HTTP server
    const server = httpServer.listen(PORT, HOST, () => {
      console.log(`🚀 Server running on http://${HOST}:${PORT}`);
      console.log('📡 Ready to handle requests');
    });

    // Track active connections
    serverState.trackConnections(server);

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err) => {
      console.error('UNHANDLED REJECTION!', err.name, err.message);
      console.error(err.stack);
      
      // Log the error but don't shut down
      console.log('⚠️  Server kept alive despite unhandled rejection');
      
      // Try to recover the error state
      if (err.name === 'MongoServerSelectionError' || err.name === 'MongooseServerSelectionError') {
        console.log('Attempting to reconnect to MongoDB...');
        // Add reconnection logic here if needed
      }
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (err) => {
      console.error('UNCAUGHT EXCEPTION!', err.name, err.message);
      console.error(err.stack);
      
      // Log the error but don't shut down
      console.log('⚠️  Server kept alive despite uncaught exception');
      
      // Try to recover from common errors
      if (err.code === 'EADDRINUSE') {
        console.log('Port is in use, trying to recover...');
        // Add port recovery logic if needed
      }
      
      return true; // Prevents default exit
    });

    // Handle SIGTERM for graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received. Gracefully shutting down...');
      serverState.gracefulShutdown();
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      console.log('SIGINT received. Gracefully shutting down...');
      serverState.gracefulShutdown();
    });

    return server;
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error(error.stack);
    
    // Attempt to close any open connections
    closeConnections();
    
    // Exit with error code
    process.exit(1);
  }
};

// Only start the server if this file is run directly (not required/imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 Starting server...');
  startServer().catch(error => {
    console.error('💥 Failed to start server:', error);
    process.exit(1);
  });
  
  // Handle SIGTERM and SIGINT for graceful shutdown
  process.on('SIGTERM', () => {
    console.log('\n🛑 SIGTERM received. Starting graceful shutdown...');
    gracefulShutdown();
  });
  
  process.on('SIGINT', () => {
    console.log('\n🛑 SIGINT received. Starting graceful shutdown...');
    gracefulShutdown();
  });
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('\n❌ UNCAUGHT EXCEPTION! Shutting down...');
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('⚠️  Server kept alive in development mode due to uncaught exception');
      return;
    }
    
    gracefulShutdown();
  });
}

export { app, httpServer, webSocketService };
