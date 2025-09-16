import express from 'express';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import os from 'os';
import process from 'process';

const router = express.Router();

// Helper function to get memory usage in MB
const getMemoryUsage = () => {
  const formatMemoryUsage = (data) => `${Math.round(data / 1024 / 1024 * 100) / 100} MB`;
  const memoryData = process.memoryUsage();
  
  return {
    rss: formatMemoryUsage(memoryData.rss),
    heapTotal: formatMemoryUsage(memoryData.heapTotal),
    heapUsed: formatMemoryUsage(memoryData.heapUsed),
    external: formatMemoryUsage(memoryData.external),
    arrayBuffers: formatMemoryUsage(memoryData.arrayBuffers)
  };
};

// Helper function to get system information
const getSystemInfo = () => ({
  platform: process.platform,
  arch: process.arch,
  nodeVersion: process.version,
  uptime: process.uptime(),
  cpuUsage: process.cpuUsage(),
  memory: {
    total: os.totalmem(),
    free: os.freemem(),
    usage: (1 - (os.freemem() / os.totalmem())) * 100
  },
  loadAvg: os.loadavg(),
  cpus: os.cpus().length
});

// Health check endpoint
router.get('/', async (req, res) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      memory: getMemoryUsage(),
      cpu: process.cpuUsage(),
      load: os.loadavg(),
      cpus: os.cpus().length
    },
    services: {
      database: {
        status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        db: mongoose.connection.db ? 'available' : 'unavailable',
        models: Object.keys(mongoose.connection.models)
      },
      cloudinary: {
        status: cloudinary.config().cloud_name ? 'configured' : 'not configured',
        cloudName: cloudinary.config().cloud_name || 'not set'
      }
    },
    environment: process.env.NODE_ENV || 'development',
    process: {
      pid: process.pid,
      version: process.version,
      memory: getMemoryUsage(),
      uptime: process.uptime(),
      argv: process.argv,
      execPath: process.execPath,
      execArgv: process.execArgv,
      cwd: process.cwd()
    }
  };

  // Check if database is connected
  const isDbConnected = mongoose.connection.readyState === 1;
  const isCloudinaryConfigured = !!cloudinary.config().cloud_name;
  
  // Set appropriate status code based on service health
  const statusCode = isDbConnected && isCloudinaryConfigured ? 200 : 503;
  
  // Add status details
  healthCheck.status = statusCode === 200 ? 'healthy' : 'degraded';
  healthCheck.healthy = statusCode === 200;
  
  // Add error details if any service is down
  if (!isDbConnected || !isCloudinaryConfigured) {
    healthCheck.issues = [];
    
    if (!isDbConnected) {
      healthCheck.issues.push('Database is not connected');
    }
    
    if (!isCloudinaryConfigured) {
      healthCheck.issues.push('Cloudinary is not properly configured');
    }
  }

  res.status(statusCode).json(healthCheck);
});

// Detailed system info endpoint (protected in production)
router.get('/system', (req, res) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ status: 'error', message: 'Unauthorized' });
  }
  
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    system: getSystemInfo(),
    environment: process.env,
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    network: os.networkInterfaces(),
    platform: os.platform(),
    release: os.release(),
    type: os.type(),
    userInfo: os.userInfo()
  });
});

export default router;
