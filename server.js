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

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: process.env.NODE_ENV === 'production',
  api_proxy: process.env.CLOUDINARY_PROXY,
  cdn_subdomain: true,
  secure_distribution: true,
  cname: process.env.CLOUDINARY_CNAME,
  private_cdn: !!process.env.CLOUDINARY_PRIVATE_CDN,
  sign_url: !!process.env.CLOUDINARY_SIGN_URL,
  ssl_detected: true
});

// Test Cloudinary connection
cloudinary.api.ping()
  .then(() => console.log('Connected to Cloudinary'))
  .catch(err => console.error('Cloudinary connection error:', err));

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

// Graceful shutdown
let isShuttingDown = false;
const gracefulShutdown = async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
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
    
    console.log('Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

// Start server
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Log unhandled rejections with more details
process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌ UNHANDLED REJECTION! Shutting down...');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  
  // Log stack trace if available
  if (reason instanceof Error) {
    console.error('Stack:', reason.stack);
  }
  
  // In development, log the error but don't shut down
  if (process.env.NODE_ENV !== 'production') {
    console.log('⚠️  Server kept alive in development mode due to unhandled rejection');
    return;
  }
  
  // In production, attempt graceful shutdown
  gracefulShutdown();
});


// Log uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Attempt to log the error to an external service
  // Then decide whether to shut down or not
  if (process.env.NODE_ENV === 'production') {
    gracefulShutdown();
  }
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
    
    // Connect to MongoDB with better error handling
    try {
      console.log('🔗 Connecting to MongoDB...');
      await connectDB();
      console.log('✅ MongoDB connected successfully');
    } catch (dbError) {
      console.error('❌ MongoDB connection error:', dbError);
      throw dbError; // Re-throw to be caught by outer try-catch
    }
    
    // Start HTTP server with better error handling
    console.log(`🌐 Starting HTTP server on ${HOST}:${PORT}...`);
    
    // Start listening
    httpServer.listen(Number(PORT), HOST, () => {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode`);
      console.log(`🌐 Server URL: http://${HOST}:${PORT}`);
      console.log(`📡 WebSocket: ws://${HOST}:${PORT}`);
      console.log(`📊 MongoDB: ${mongoose.connection.host} (${mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'})`);
      console.log(`☁️  Cloudinary: ${cloudinary.config().cloud_name ? 'connected' : 'not configured'}`);
      console.log(`📅 ${new Date().toLocaleString()}`);
      console.log(`${'='.repeat(50)}\n`);
      
      // Log all environment variables (excluding sensitive ones) for debugging
      console.log('🛠️  Environment:');
      Object.entries(process.env).forEach(([key, value]) => {
        if (key.includes('SECRET') || key.includes('KEY') || key.includes('PASSWORD')) {
          console.log(`   ${key}=[REDACTED]`);
        } else if (key.startsWith('NODE_') || key.startsWith('npm_') || key === 'PATH' || key === 'HOME') {
          // Skip common Node/npm env vars
        } else {
          console.log(`   ${key}=${value}`);
        }
      });
      console.log('\n✅ Server started successfully!');
    });
    
    // Handle server errors
    httpServer.on('error', (error) => {
      if (error.syscall !== 'listen') {
        throw error;
      }
      
      // Handle specific listen errors with friendly messages
      switch (error.code) {
        case 'EACCES':
          console.error(`Port ${PORT} requires elevated privileges`);
          process.exit(1);
          break;
        case 'EADDRINUSE':
          console.error(`Port ${PORT} is already in use`);
          process.exit(1);
          break;
        default:
          throw error;
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
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
