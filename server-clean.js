import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import { createServer } from 'http';
import multer from 'multer';
import os from 'os';
import path from 'path';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { WebSocketService } from './services/websocket.js';
import { initializeDatabase, dbRun, dbGet, dbAll } from './db.js';

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize WebSocket service
const webSocketService = new WebSocketService(httpServer);
app.set('webSocketService', webSocketService);

// Routes
app.use('/api/auth', (await import('./routes/auth.js')).default);
app.use('/api/polls', (await import('./routes/polls.js')).default);
app.use('/api/study-groups', (await import('./routes/study-groups.js')).default);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Initialize database and start server
async function initializeServer() {
  try {
    // Initialize database
    await initializeDatabase();
    console.log('Database initialized successfully');

    // Start the server
    const PORT = process.env.PORT || 5000;
    const HOST = process.env.HOST || '0.0.0.0';

    httpServer.listen(PORT, HOST, () => {
      console.log(`Server running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
      console.log(`WebSocket service running on ws://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the application
initializeServer();
