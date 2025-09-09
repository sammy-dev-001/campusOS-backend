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
import { initializeDatabase, getDb, dbRun, dbGet, dbAll } from './db.js';
import sqlite3 from 'sqlite3';

// Import routes before server starts
import pollsRouter from './routes/polls.js';
import tutorApplicationsRouter from './routes/tutorApplications.js';

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Utility to get the local network IP address
function getLocalExternalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Configure multer for profile pictures and general uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)){
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Configure multer storage for posts
const postStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, 'uploads', 'posts');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// Configure multer for post uploads
const postUpload = multer({
  storage: postStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/quicktime'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and MP4 files are allowed.'));
    }
  }
});

// Configure multer storage for chat uploads
// Configure multer storage for chat uploads
const chatUploadStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, 'uploads', 'chats');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const chatUpload = multer({ storage: chatUploadStorage });

// Configure multer storage for document uploads
const documentUploadStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, 'uploads', 'documents');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const documentUpload = multer({ storage: documentUploadStorage });

// Multer storage for event images
const eventStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, 'uploads', 'events');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const eventUpload = multer({ storage: eventStorage });

const app = express();

// Create HTTP server
const httpServer = createServer(app);

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configure CORS for all routes
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Content-Length', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200 // Some legacy browsers (IE11, various SmartTVs) choke on 204
};

// Apply CORS to all routes
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Parse JSON bodies for all requests
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Initialize WebSocket service
const webSocketService = new WebSocketService(httpServer);

// Make WebSocket service available to routes
app.set('webSocketService', webSocketService);

// Initialize database and start server
async function initializeServer() {
  try {
    // Initialize database
    await initializeDatabase();
    
    console.log('Database initialized successfully');
    
    // Create users table if it doesn't exist
    await dbRun(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      profile_picture TEXT
    )`);

    // Create chats table with study group support
    await dbRun(`CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('individual', 'group', 'study_group')),
      name TEXT,
      description TEXT,
      code TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      group_image TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Create chat_participants table
    await dbRun(`CREATE TABLE IF NOT EXISTS chat_participants (
      chat_id INTEGER,
      user_id INTEGER,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (chat_id, user_id),
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    console.log('Database tables initialized with study group support');

    // Create chat_participants table
    await dbRun(`CREATE TABLE IF NOT EXISTS chat_participants (
      chat_id INTEGER,
      user_id INTEGER,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (chat_id, user_id),
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // Create messages table
    await dbRun(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('text', 'image', 'video')),
      media_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // Add test users if none exist
    const count = await dbGet('SELECT COUNT(*) as count FROM users');
    if (count.count === 0) {
      const testUsers = [
        {
          username: 'john_doe',
          display_name: 'John Doe',
          email: 'john@example.com',
          password: await bcrypt.hash('password123', 10),
          profile_picture: null
        },
        {
          username: 'jane_smith',
          display_name: 'Jane Smith',
          email: 'jane@example.com',
          password: await bcrypt.hash('password123', 10),
          profile_picture: null
        },
        {
          username: 'test_user',
          display_name: 'Test User',
          email: 'test@example.com',
          password: await bcrypt.hash('password123', 10),
          profile_picture: null
        }
      ];

      for (const user of testUsers) {
        await dbRun(
          'INSERT INTO users (username, display_name, email, password, profile_picture) VALUES (?, ?, ?, ?, ?)',
          [user.username, user.display_name, user.email, user.password, user.profile_picture]
        );
      }
      console.log('Test users added successfully');
    }

    // Create posts table if it doesn't exist
    await dbRun(`CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      username TEXT NOT NULL,
      content TEXT,
      timestamp DATETIME DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
      media_url TEXT,
      likes_count INTEGER DEFAULT 0,
      comments_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
      updated_at DATETIME DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )`);
    
    // Check if we need to add created_at and updated_at columns
    const postsColumns = await dbAll("PRAGMA table_info(posts)");
    const postsColumnNames = postsColumns.map(col => col.name);
    
    if (!postsColumnNames.includes('created_at')) {
      // SQLite doesn't support adding columns with DEFAULT CURRENT_TIMESTAMP
      // So we'll add the column without a default and then update existing rows
      await dbRun('ALTER TABLE posts ADD COLUMN created_at DATETIME');
      // Set a default value for existing rows using the same format as the table creation
      await dbRun("UPDATE posts SET created_at = strftime('%Y-%m-%d %H:%M:%S', 'now') WHERE created_at IS NULL");
    }
    
    if (!postsColumnNames.includes('updated_at')) {
      await dbRun('ALTER TABLE posts ADD COLUMN updated_at DATETIME');
      await dbRun("UPDATE posts SET updated_at = strftime('%Y-%m-%d %H:%M:%S', 'now') WHERE updated_at IS NULL");
    }
    
    // For new rows, we'll handle the defaults in the INSERT statements

    // Create comments table if it doesn't exist
    await dbRun(`CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER,
      user_id INTEGER,
      username TEXT,
      content TEXT NOT NULL,
      timestamp DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%S.000Z', 'now')),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    // Add a test post and comment if none exist
    const postCount = await dbGet('SELECT COUNT(*) as count FROM posts');
    if (postCount.count === 0) {
      // Add a test post
      const testPost = {
        userId: 1, // Assuming test user has ID 1
        username: 'testuser',
        content: 'This is a test post'
      };
      const postResult = await dbRun(
        'INSERT INTO posts (userId, username, content) VALUES (?, ?, ?)',
        [testPost.userId, testPost.username, testPost.content]
      );
      console.log('Test post added successfully');

      // Add a test comment
      const testComment = {
        post_id: postResult.lastID,
        user_id: 1,
        username: 'testuser',
        content: 'This is a test comment'
      };
      await dbRun(
        'INSERT INTO comments (post_id, user_id, username, content) VALUES (?, ?, ?, ?)',
        [testComment.post_id, testComment.user_id, testComment.username, testComment.content]
      );
      console.log('Test comment added successfully');

      // Update post's comment count
      await dbRun('UPDATE posts SET comments_count = 1 WHERE id = ?', [postResult.lastID]);
    }

    // Create likes table
    await dbRun(`CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER,
      user_id INTEGER,
      timestamp DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%S.000Z', 'now')),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(post_id, user_id)
    )`);

    // Create comment_likes table
    await dbRun(`CREATE TABLE IF NOT EXISTS comment_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id INTEGER,
      user_id INTEGER,
      timestamp DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%S.000Z', 'now')),
      FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(comment_id, user_id)
    )`);

    // Create documents table if not exists
    await dbRun(`CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      courseCode TEXT,
      level TEXT,
      semester TEXT,
      docType TEXT,
      uploaderName TEXT,
      fileUrl TEXT NOT NULL,
      fileType TEXT,
      createdAt INTEGER
    )`);

    // Ensure announcements table exists
    await dbRun(`CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      author TEXT NOT NULL,
      date INTEGER NOT NULL,
      category TEXT NOT NULL,
      attachmentUrl TEXT,
      likes INTEGER DEFAULT 0,
      bookmarkedBy TEXT DEFAULT '[]'
    )`);

    // Migration: add likedBy column if it doesn't exist
    try {
      const result = await dbRun("SELECT name FROM pragma_table_info('announcements') WHERE name = 'likedBy'");
      if (!result || result.length === 0) {
        await dbRun("ALTER TABLE announcements ADD COLUMN likedBy TEXT DEFAULT '[]'");
        console.log('Migration: likedBy column added to announcements table.');
      }
    } catch (e) {
      console.error('Migration error (likedBy):', e);
    }

    // Create events table if it doesn't exist
    await dbRun(`CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      image TEXT,
      description TEXT,
      date TEXT,
      time TEXT,
      location TEXT,
      category TEXT,
      isFeatured INTEGER DEFAULT 0
    )`);

    // Migration: add parent_comment_id column to comments if it doesn't exist
    try {
      const result = await dbRun("SELECT name FROM pragma_table_info('comments') WHERE name = 'parent_comment_id'");
      if (!result || result.length === 0) {
        await dbRun("ALTER TABLE comments ADD COLUMN parent_comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE");
        console.log('Migration: parent_comment_id column added to comments table.');
      }
    } catch (e) {
      console.error('Migration error (parent_comment_id):', e);
    }


    // Helper function to add column only if it does not exist (kept for backward compatibility)
    async function addColumnIfNotExists(db, table, column, typeAndDefault) {
      try {
        const columns = await dbAll(`PRAGMA table_info(${table})`);
        const exists = columns.some(col => col.name === column);
        if (!exists) {
          try {
            await dbRun(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeAndDefault}`);
            console.log(`Added column ${column} to table ${table}`);
          } catch (err) {
            if (err.code === 'SQLITE_ERROR' && err.message.includes('duplicate column')) {
              console.log(`Column ${column} already exists in table ${table}, skipping...`);
            } else {
              throw err; // Re-throw other errors
            }
          }
        }
      } catch (err) {
        console.error(`Error checking/adding column ${column} to table ${table}:`, err);
        throw err; // Re-throw to be caught by the outer try-catch
      }
    }

    // --- Forum Threads Table Migration ---
    try {
      await dbRun(`CREATE TABLE IF NOT EXISTS forum_threads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        author_id INTEGER NOT NULL,
        author_name TEXT NOT NULL,
        timestamp DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%S.000Z', 'now')),
        upvotes INTEGER DEFAULT 0
      )`);
      console.log('forum_threads table ensured.');

      // Safe migration: add likedBy column to announcements if it doesn't exist
      try {
        const result = await dbRun("SELECT name FROM pragma_table_info('announcements') WHERE name = 'likedBy'");
        if (!result || result.length === 0) {
          await dbRun("ALTER TABLE announcements ADD COLUMN likedBy TEXT DEFAULT '[]'");
        }
      } catch (e) {
        console.error('Error checking/adding likedBy column:', e);
      }

      await dbRun(`
        CREATE TABLE IF NOT EXISTS forum_comments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          thread_id INTEGER,
          user_id INTEGER,
          content TEXT NOT NULL,
          timestamp DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%S.000Z', 'now')),
          parent_comment_id INTEGER,
          FOREIGN KEY (thread_id) REFERENCES forum_threads(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (parent_comment_id) REFERENCES forum_comments(id) ON DELETE CASCADE
        )`);
      console.log('forum_comments table ensured.');

      // Safe migration: add upvotes column to forum_threads if it doesn't exist
      try {
        const result = await dbRun("SELECT name FROM pragma_table_info('forum_threads') WHERE name = 'upvotes'");
        if (!result || result.length === 0) {
          await dbRun("ALTER TABLE forum_threads ADD COLUMN upvotes INTEGER DEFAULT 0");
        }
      } catch (e) {
        console.error('Error checking/adding upvotes column:', e);
      }
    } catch (e) {
      console.error('Migration error (forum_comments):', e);
    }

    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing database tables:', error);
    process.exit(1);
  }
}

// Initialize database before starting the server
await initializeDatabase();

// --- Chat Messages REST Endpoints ---
// List messages for a chat
app.get('/api/chats/:id/messages', async (req, res) => {
  try {
    const chatId = req.params.id;
    const rows = await dbAll(
      'SELECT id, chat_id, sender_id, content, type, media_url, created_at FROM messages WHERE chat_id = ? ORDER BY created_at ASC, id ASC',
      [chatId]
    );
    const messages = rows.map(r => ({
      id: String(r.id),
      chatId: String(r.chat_id),
      senderId: r.sender_id,
      content: r.content || '',
      type: r.type,
      mediaUrl: r.media_url || undefined,
      createdAt: new Date(r.created_at).toISOString(),
      timestamp: new Date(r.created_at).toISOString(),
      status: 'delivered'
    }));
    res.json(messages);
  } catch (e) {
    console.error('GET /api/chats/:id/messages error:', e);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Create a new message in a chat
app.post('/api/chats/:id/messages', async (req, res) => {
  try {
    const chatId = req.params.id;
    const { content = '', type = 'text', mediaUrl = null, senderId, tempId } = req.body || {};
    const userId = senderId || Number(req.query.userId);
    if (!userId) return res.status(400).json({ error: 'senderId is required' });

    const allowed = ['text', 'image', 'video'];
    const safeType = allowed.includes(type) ? type : 'text';

    const result = await dbRun(
      'INSERT INTO messages (chat_id, sender_id, content, type, media_url) VALUES (?, ?, ?, ?, ?)',
      [chatId, userId, content, safeType, mediaUrl]
    );

    const row = await dbGet('SELECT * FROM messages WHERE id = ?', [result.lastID]);
    const saved = {
      id: String(row.id),
      chatId: String(row.chat_id),
      senderId: row.sender_id,
      content: row.content || '',
      type: row.type,
      mediaUrl: row.media_url || undefined,
      createdAt: new Date(row.created_at).toISOString(),
      timestamp: new Date(row.created_at).toISOString(),
      status: 'sent'
    };

    // Broadcast via socket to chat room if desired
    io.emit('new_message', saved);

    res.status(201).json(saved);
  } catch (e) {
    console.error('POST /api/chats/:id/messages error:', e);
    res.status(500).json({ error: 'Failed to save message' });
  }
});

// --- WebSocket Connection and Event Handlers ---
const activeSockets = new Map(); // userId -> socketId mapping
const userRooms = new Map(); // userId -> Set of roomIds

// Track typing users for each chat
const typingUsers = new Map(); // chatId -> Set of userIds

// Track online users
const onlineUsers = new Set();

// Helper function to emit to all users in a chat except sender
const emitToChat = (chatId, event, data, senderId = null) => {
  const chatUsers = userRooms.get(chatId) || new Set();
  chatUsers.forEach(userId => {
    if (senderId && userId === senderId) return; // Don't send back to sender
    const socketId = activeSockets.get(userId);
    if (socketId) {
      io.to(socketId).emit(event, data);
    }
  });
};

// Handle WebSocket connections for chat
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  // Register user's socket
  socket.on('register', async (userId) => {
    try {
      console.log('User', userId, 'connected with socket', socket.id);
      activeSockets.set(userId, socket.id);
      onlineUsers.add(userId);
      
      // Join user to their personal room
      socket.join('user_' + userId);
      
      // Notify others about user's online status
      socket.broadcast.emit('user_online', { userId });
      
      // Send current online status of all users
      io.emit('online_users', Array.from(onlineUsers));
      
      // Join all user's existing chat rooms
      const userChats = await dbAll(
        'SELECT chat_id FROM chat_participants WHERE user_id = ?', 
        [userId]
      );
      
      userChats.forEach(chat => {
        const roomId = 'chat_' + chat.chat_id;
        socket.join(roomId);
        
        // Track user's rooms
        if (!userRooms.has(chat.chat_id)) {
          userRooms.set(chat.chat_id, new Set());
        }
        userRooms.get(chat.chat_id).add(userId);
      });
      
    } catch (error) {
      console.error('Error during socket registration:', error);
    }
  });
  
  // Handle new message
  socket.on('send_message', async (data) => {
    try {
      const { chatId, senderId, content, tempId, type = 'text', mediaUrl = null, replyTo = null } = data;
      
      // Save message to database
      const result = await dbRun(
        'INSERT INTO messages (chat_id, sender_id, content, type, media_url, reply_to, status) VALUES (?, ?, ?, ?, ?, ?, "sent")',
        [chatId, senderId, content, type, mediaUrl, replyTo]
      );
      
      const messageId = result.lastID;
      const message = await dbGet('SELECT * FROM messages WHERE id = ?', [messageId]);
      
      // Emit to all participants in the chat
      io.to('chat_' + chatId).emit('new_message', {
        ...message,
        tempId, // Include tempId for client-side message tracking
      });
      
      // Update last message in chat
      await dbRun(
        'UPDATE chats SET last_message_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [messageId, chatId]
      );
      
      // Emit message status update
      io.to('user_' + senderId).emit('message_status', {
        messageId: tempId || messageId,
        status: 'sent',
        chatId
      });
      
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
  
  // Handle typing indicator
  socket.on('typing', (data) => {
    const { chatId, userId, isTyping } = data;
    
    if (isTyping) {
      if (!typingUsers.has(chatId)) {
        typingUsers.set(chatId, new Set());
      }
      typingUsers.get(chatId).add(userId);
    } else if (typingUsers.has(chatId)) {
      typingUsers.get(chatId).delete(userId);
    }
    
    // Emit to all participants except the sender
    socket.to('chat_' + chatId).emit('typing', {
      chatId,
      userId,
      isTyping,
      typingUsers: Array.from(typingUsers.get(chatId) || [])
    });
  });
  
  // Handle message read receipt
  socket.on('mark_read', async (data) => {
    const { messageIds, chatId, userId } = data;
    
    try {
      // Update messages as read in database
      const placeholders = messageIds.map(() => '?').join(',');
      await dbRun(
        'UPDATE messages SET status = ?, read_at = CURRENT_TIMESTAMP WHERE id IN (' + placeholders + ')',
        ['read', ...messageIds]
      );
      
      // Emit read receipt to all participants
      io.to('chat_' + chatId).emit('message_status', {
        messageIds,
        status: 'read',
        chatId,
        readBy: userId,
        readAt: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  });
  
  // Handle message delivered receipt
  socket.on('mark_delivered', async (data) => {
    const { messageIds, chatId } = data;
    
    try {
      // Update messages as delivered in database
      const placeholders = messageIds.map(() => '?').join(',');
      await dbRun(
        'UPDATE messages SET status = ?, delivered_at = CURRENT_TIMESTAMP WHERE id IN (' + placeholders + ')',
        ['delivered', ...messageIds]
      );
      
      // Emit delivered receipt to all participants
      io.to('chat_' + chatId).emit('message_status', {
        messageIds,
        status: 'delivered',
        chatId,
        deliveredAt: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Error marking messages as delivered:', error);
    }
  });
  
  // Handle message reaction
  socket.on('react_to_message', async (data) => {
    const { messageId, chatId, userId, emoji } = data;
    
    try {
      // Get current reactions
      const message = await dbGet('SELECT * FROM messages WHERE id = ?', [messageId]);
      const reactions = message.reactions ? JSON.parse(message.reactions) : {};
      
      // Toggle reaction
      if (reactions[userId] === emoji) {
        delete reactions[userId]; // Remove if same emoji
      } else {
        reactions[userId] = emoji; // Add/update reaction
      }
      
      // Update message with new reactions
      await dbRun(
        'UPDATE messages SET reactions = ? WHERE id = ?',
        [JSON.stringify(reactions), messageId]
      );
      
      // Emit reaction update to all participants
      io.to('chat_' + chatId).emit('message_reaction', {
        messageId,
        chatId,
        reactions,
        updatedBy: userId
      });
      
    } catch (error) {
      console.error('Error updating message reaction:', error);
      socket.emit('error', { message: 'Failed to update reaction' });
    }
  });
  
  // Handle message edit
  socket.on('edit_message', async (data) => {
    const { messageId, chatId, userId, newContent } = data;
    
    try {
      // Verify user is the sender
      const message = await dbGet('SELECT * FROM messages WHERE id = ?', [messageId]);
      if (!message || message.sender_id !== userId) {
        throw new Error('Unauthorized to edit this message');
      }
      
      // Update message content
      await dbRun(
        'UPDATE messages SET content = ?, is_edited = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newContent, messageId]
      );
      
      // Get updated message
      const updatedMessage = await dbGet('SELECT * FROM messages WHERE id = ?', [messageId]);
      
      // Emit update to all participants
      io.to('chat_' + chatId).emit('message_edited', {
        messageId,
        chatId,
        updatedMessage,
        updatedBy: userId
      });
      
    } catch (error) {
      console.error('Error editing message:', error);
      socket.emit('error', { message: 'Failed to edit message' });
    }
  });
  
  // Handle group creation
  socket.on('create_group', async (data) => {
    const { name, participants, createdBy } = data;
    
    try {
      // Start transaction
      await dbRun('BEGIN TRANSACTION');
      
      // Create group chat
      const result = await dbRun(
        'INSERT INTO chats (name, is_group, created_by, created_at) VALUES (?, 1, ?, CURRENT_TIMESTAMP)',
        [name, createdBy]
      );
      
      const chatId = result.lastID;
      
      // Add participants to the group
      const currentTime = new Date().toISOString();
      const participantValues = participants.map(userId => 
        '(' + chatId + ', ' + userId + ', \'' + currentTime + '\')'
      ).join(',');
      
      await dbRun(
        `INSERT INTO chat_participants (chat_id, user_id, joined_at) 
         VALUES ${participantValues}`
      );
      
      // Add creator as participant if not already included
      if (!participants.includes(createdBy)) {
        await dbRun(
          'INSERT INTO chat_participants (chat_id, user_id, joined_at) VALUES (?, ?, ?)',
          [chatId, createdBy, new Date().toISOString()]
        );
      }
      
      // Get the newly created group
      const group = await dbGet('SELECT * FROM chats WHERE id = ?', [chatId]);
      
      // Add participants to the chat room
      participants.forEach(userId => {
        if (!userRooms.has(chatId)) {
          userRooms.set(chatId, new Set());
        }
        userRooms.get(chatId).add(userId);
        
        // Join socket room if online
        const socketId = activeSockets.get(userId);
        if (socketId) {
          io.sockets.sockets.get(socketId)?.join(`chat_${chatId}`);
        }
      });
      
      // Commit transaction
      await dbRun('COMMIT');
      
      // Emit group created event to all participants
      const participantSockets = participants
        .map(userId => activeSockets.get(userId))
        .filter(Boolean);
      
      io.to(participantSockets).emit('group_created', {
        group,
        addedBy: createdBy
      });
      
    } catch (error) {
      await dbRun('ROLLBACK');
      console.error('Error creating group:', error);
      socket.emit('error', { message: 'Failed to create group' });
    }
  });
  
  // Handle message pinning
  socket.on('pin_message', async (data) => {
    const { messageId, chatId, userId, isPinned } = data;
    
    try {
      // Verify user has permission to pin (e.g., is admin or message sender)
      const message = await dbGet('SELECT * FROM messages WHERE id = ?', [messageId]);
      const isAdmin = await dbGet(
        'SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id = ? AND is_admin = 1',
        [chatId, userId]
      );
      
      if (!message || (message.sender_id !== userId && !isAdmin)) {
        throw new Error('Unauthorized to pin this message');
      }
      
      // Update message pinned status
      await dbRun(
        'UPDATE messages SET is_pinned = ?, pinned_at = ? WHERE id = ?',
        [isPinned ? 1 : 0, isPinned ? new Date().toISOString() : null, messageId]
      );
      
      // Emit update to all participants
      io.to(`chat_${chatId}`).emit('message_pinned', {
        messageId,
        chatId,
        isPinned,
        updatedBy: userId,
        updatedAt: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Error pinning message:', error);
      socket.emit('error', { message: 'Failed to pin message' });
    }
  });
  
  // Handle group management
  socket.on('update_group', async (data) => {
    const { chatId, updates, updatedBy } = data;
    const { name, description, avatar, participants } = updates;
    
    try {
      // Verify user has permission to update group
      const isAdmin = await dbGet(
        'SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id = ? AND is_admin = 1',
        [chatId, updatedBy]
      );
      
      if (!isAdmin) {
        throw new Error('Only group admins can update group settings');
      }
      
      // Start transaction
      await dbRun('BEGIN TRANSACTION');
      
      // Update group details
      if (name || description || avatar) {
        const updates = [];
        const params = [];
        
        if (name) {
          updates.push('name = ?');
          params.push(name);
        }
        if (description) {
          updates.push('description = ?');
          params.push(description);
        }
        if (avatar) {
          updates.push('avatar = ?');
          params.push(avatar);
        }
        
        params.push(chatId);
        
        await dbRun(
          `UPDATE chats SET ${updates.join(', ')} WHERE id = ?`,
          params
        );
      }
      
      // Update participants if provided
      if (participants) {
        // Remove existing participants not in the new list
        await dbRun(
          'DELETE FROM chat_participants WHERE chat_id = ? AND user_id NOT IN (?)',
          [chatId, participants.join(',')]
        );
        
        // Add new participants
        const existingParticipants = await dbAll(
          'SELECT user_id FROM chat_participants WHERE chat_id = ?',
          [chatId]
        );
        
        const existingIds = existingParticipants.map(p => p.user_id);
        const newParticipants = participants.filter(id => !existingIds.includes(id));
        
        if (newParticipants.length > 0) {
          const values = newParticipants.map(userId => 
            `(${chatId}, ${userId}, '${new Date().toISOString()}', 0)`
          ).join(',');
          
          await dbRun(
            `INSERT INTO chat_participants (chat_id, user_id, joined_at, is_admin) 
             VALUES ${values}`
          );
          
          // Add new participants to the room
          newParticipants.forEach(userId => {
            if (!userRooms.has(chatId)) {
              userRooms.set(chatId, new Set());
            }
            userRooms.get(chatId).add(userId);
            
            // Join socket room if online
            const socketId = activeSockets.get(userId);
            if (socketId) {
              io.sockets.sockets.get(socketId)?.join(`chat_${chatId}`);
            }
          });
        }
      }
      
      // Commit transaction
      await dbRun('COMMIT');
      
      // Get updated group info
      const updatedGroup = await dbGet('SELECT * FROM chats WHERE id = ?', [chatId]);
      const groupParticipants = await dbAll(
        'SELECT user_id, is_admin FROM chat_participants WHERE chat_id = ?',
        [chatId]
      );
      
      // Emit update to all participants
      io.to(`chat_${chatId}`).emit('group_updated', {
        chatId,
        group: updatedGroup,
        participants: groupParticipants,
        updatedBy,
        updatedAt: new Date().toISOString()
      });
      
    } catch (error) {
      await dbRun('ROLLBACK');
      console.error('Error updating group:', error);
      socket.emit('error', { message: 'Failed to update group' });
    }
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Find and remove the disconnected user
    for (const [userId, socketId] of activeSockets.entries()) {
      if (socketId === socket.id) {
        activeSockets.delete(userId);
        onlineUsers.delete(userId);
        
        // Notify others about user's offline status
        socket.broadcast.emit('user_offline', { userId });
        
        // Clean up user's rooms
        userRooms.forEach((users, roomId) => {
          users.delete(userId);
          if (users.size === 0) {
            userRooms.delete(roomId);
          }
        });
        
        break;
      }
    }
  });
});

// --- In-memory user status tracking ---
const userStatus = {};
const userSockets = {};

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected with socket id ' + socket.id);

  socket.on('register', (userId) => {
    console.log('Registering user ' + userId + ' with socket id ' + socket.id);
    userSockets[userId] = socket.id;
    userStatus[userId] = 'online';
    // Store userId on the socket for easier access on disconnect
    socket.userId = userId; 
    io.emit('userStatus', userStatus);
    console.log('Current user sockets:', userSockets);
  });

  socket.on('joinChat', (chatId) => {
    socket.join('chat:' + chatId);
  });

  socket.on('leaveChat', (chatId) => {
    socket.leave('chat:' + chatId);
  });

  socket.on('sendMessage', async (message) => {
    try {
      const { chat_id, content, type = 'text', media_url = null, tempId } = message;
      const sender_id = Object.keys(userSockets).find(key => userSockets[key] === socket.id);

      if (!sender_id) {
        return;
      }

      // 1. Insert message into DB
      const result = await dbRun(
        'INSERT INTO messages (chat_id, sender_id, content, type, media_url) VALUES (?, ?, ?, ?, ?)',
        [chat_id, sender_id, content, type, media_url]
      );
      const newMessageId = result.lastID;

      // 2. Fetch the newly created message to get all details (like timestamp)
      const newMessage = await dbGet(
        'SELECT m.id, m.chat_id, m.sender_id, m.content, m.type, m.media_url, m.created_at, u.username, u.display_name, u.profile_picture ' +
        'FROM messages m ' +
        'JOIN users u ON m.sender_id = u.id ' +
        'WHERE m.id = ?',
        [newMessageId]
      );
      
      if (!newMessage) {
        console.error('Failed to fetch new message after insertion.');
        return;
      }
      
      const finalMessage = {
        ...newMessage,
        timestamp: newMessage.created_at, // Ensure timestamp field is populated
        mediaUrl: newMessage.media_url, // Convert media_url to mediaUrl for client
        sender: {
          username: newMessage.username,
          display_name: newMessage.display_name,
          profile_picture: newMessage.profile_picture,
        },
        tempId: tempId, // Include the tempId in the broadcast
      };

      // 3. Get all participants of the chat
      const participants = await dbAll(
        'SELECT user_id FROM chat_participants WHERE chat_id = ?',
        [chat_id]
      );

      // 4. Emit the new message to all participants who are online
      participants.forEach(({ user_id }) => {
        const participantSocketId = userSockets[user_id];
        if (participantSocketId) {
          io.to(participantSocketId).emit('newMessage', finalMessage);
          console.log(`Emitting 'newMessage' to user ${user_id} on socket ${participantSocketId}`);
        }
      });

      // Also, update the last message timestamp for the chat
      await dbRun('UPDATE chats SET created_at = CURRENT_TIMESTAMP WHERE id = ?', [chat_id]);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  });

  socket.on('deleteMessage', async ({ messageId }) => {
    try {
      // Get the message to check sender
      const message = await dbGet('SELECT * FROM messages WHERE id = ?', [messageId]);
      if (!message) return;
      if (message.sender_id?.toString() !== socket.userId?.toString()) return;
      await dbRun('DELETE FROM messages WHERE id = ?', [messageId]);
      io.to(`chat:${message.chat_id}`).emit('messageDeleted', { messageId });
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      console.log(`User ${socket.userId} disconnected`);
      delete userSockets[socket.userId];
      delete userStatus[socket.userId];
      io.emit('userStatus', userStatus);
      console.log('Current user sockets:', userSockets);
    } else {
      console.log('An un-registered user disconnected with socket id ' + socket.id);
    }
  });
});

// Add CORS headers for all routes and static files
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// Add request body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log('Request headers:', req.headers);
  console.log('Request body:', req.body);
  next();
});

// Add error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ message: 'Internal server error', error: err.message });
});

// Simple route path validation
const validatePath = (path) => {
  // Skip validation for non-string paths (like regex routes)
  if (path instanceof RegExp) {
    return true;
  }
  
  // Ensure path is a string
  if (typeof path !== 'string') {
    return true; // Let Express handle non-string paths
  }
  
  // Skip validation for internal paths and Express.js properties
  const internalPaths = [
    'env', 'trust proxy', 'trust proxy fn', 'json escape', 'json replacer', 'json spaces',
    'case sensitive routing', 'etag', 'query parser', 'strict routing', 'x-powered-by',
    'subdomain offset', 'views', 'view cache', 'view engine', 'jsonp callback name'
  ];
  
  if (internalPaths.includes(path) || 
      path.startsWith('/_next/') || 
      path.startsWith('/__') || 
      path === '/health' ||
      path.includes(' ')) { // Skip paths with spaces (usually Express internals)
    return true;
  }
  
  // Check if path starts with a forward slash (unless it's an internal path)
  if (!path.startsWith('/')) {
    return true; // Let Express handle non-route paths
  }
  
  // Check for URL-like paths
  if (path.includes('://')) {
    console.error(`[DEBUG] Path appears to be a URL: "${path}"`);
    return false;
  }
  
  // Check for invalid parameter syntax
  const paramRegex = /:([^/]*)/g;
  let match;
  while ((match = paramRegex.exec(path)) !== null) {
    if (!match[1] || match[1].trim() === '') {
      console.error(`[DEBUG] Invalid parameter in path: "${path}"`);
      return false;
    }
  }
  
  return true;
};


// Route registration with validation
const originalGet = app.get;
app.get = function(path, ...handlers) {
  console.log('\n[DEBUG] Registering GET route. Path value:', path, '| Type:', typeof path, '| Handlers:', handlers.length);
  if (!validatePath(path)) {
    throw new Error(`Invalid GET route path: ${path}`);
  }
  return originalGet.call(this, path, ...handlers);
};

const originalPost = app.post;
app.post = function(path, ...handlers) {
  console.log('\n[DEBUG] Registering POST route. Path value:', path, '| Type:', typeof path, '| Handlers:', handlers.length);
  if (!validatePath(path)) {
    throw new Error(`Invalid POST route path: ${path}`);
  }
  return originalPost.call(this, path, ...handlers);
};

const originalDelete = app.delete;
app.delete = function(path, ...handlers) {
  console.log('\n[DEBUG] Registering DELETE route. Path value:', path, '| Type:', typeof path, '| Handlers:', handlers.length);
  if (!validatePath(path)) {
    throw new Error(`Invalid DELETE route path: ${path}`);
  }
  return originalDelete.call(this, path, ...handlers);
};

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to CampusOS Backend API',
    status: 'operational',
    documentation: 'https://github.com/sammy-dev-001/campusOS-backend',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Debug route to list all users (temporary)
app.get('/debug/users', async (req, res) => {
  try {
    const users = await dbAll('SELECT id, username, email, created_at FROM users');
    res.json({
      count: users.length,
      users: users
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users', details: error.message });
  }
});

// Environment info endpoint
app.get('/env', (req, res) => {
  res.json({
    node_env: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 5000,
    platform: process.platform,
    node_version: process.version
  });
});

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/uploads/posts', express.static(path.join(__dirname, 'uploads/posts')));

// Use polls routes
app.use('/api/polls', pollsRouter);
app.use('/api/tutor-applications', tutorApplicationsRouter);

// Add debug logging for static file requests
app.use('/uploads', (req, res, next) => {
  console.log('Static file request:', {
    url: req.url,
    path: path.join(__dirname, 'uploads', req.url),
    exists: fs.existsSync(path.join(__dirname, 'uploads', req.url))
  });
  next();
});

// Signup endpoint
app.post('/signup', async (req, res) => {
  console.log('Received signup request:', req.body);
  const { loginUsername, displayName, email, password } = req.body;

  if (!loginUsername || !displayName || !email || !password) {
    console.log('Missing required fields:', { loginUsername, displayName, email, password: !!password });
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('Password hashed successfully');
    
    // First check if user already exists
    const existingUser = await dbGet(
      'SELECT * FROM users WHERE email = ? OR username = ?',
      [email, loginUsername]
    );
    
    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(409).json({ message: 'Email already in use.' });
      } else if (existingUser.username === loginUsername) {
        return res.status(409).json({ message: 'Username already taken.' });
      }
    }
    
    // Insert new user
    const result = await dbRun(
      'INSERT INTO users (username, display_name, email, password) VALUES (?, ?, ?, ?)',
      [loginUsername, displayName, email, hashedPassword]
    );
    
    if (result.error) {
      console.error('Database error during signup:', result.error);
      if (result.error.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ message: 'Username or email already exists.' });
      }
      return res.status(500).json({ message: 'Server error during signup.' });
    }
    
    console.log('User registered successfully:', { userId: result.lastID, displayName });
    return res.status(201).json({ 
      message: 'User registered successfully!', 
      userId: result.lastID,
      username: loginUsername,
      display_name: displayName 
    });
  } catch (error) {
    console.error('Error during signup process:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Login endpoint
app.post('/login', async (req, res) => {
  console.log('Login endpoint - Request body:', req.body);
  console.log('Login endpoint - Request headers:', req.headers);
  
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    console.log('Missing required fields:', { 
      hasIdentifier: !!identifier, 
      hasPassword: !!password,
      body: req.body
    });
    return res.status(400).json({ message: 'Email/Username and password are required.' });
  }

  // Basic password validation
  if (password.length < 3) {
    console.log('Password too short');
    return res.status(400).json({ message: 'Password must be at least 3 characters long.' });
  }

  try {
    // Check if identifier is an email or username
    const isEmail = identifier.includes('@');
    console.log('Login attempt:', { 
      identifier, 
      isEmail, 
      type: isEmail ? 'email' : 'username' 
    });
    
    let user;
    let query;
    
    if (isEmail) {
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(identifier)) {
        console.log('Invalid email format');
        return res.status(400).json({ message: 'Invalid email format.' });
      }
      console.log('Searching by email:', identifier);
      query = 'SELECT * FROM users WHERE email = ?';
      user = await dbGet(query, [identifier]);
      console.log('Email query result:', user);
    } else {
      console.log('Searching by username:', identifier);
      query = 'SELECT * FROM users WHERE username = ?';
      user = await dbGet(query, [identifier]);
      console.log('Username query result:', user);
    }

    if (!user) {
      console.log('User not found for:', { identifier, type: isEmail ? 'email' : 'username' });
      return res.status(401).json({ message: 'Invalid email/username or password.' });
    }

    console.log('User found:', { 
      id: user.id, 
      username: user.username, 
      email: user.email 
    });

    const isMatch = await bcrypt.compare(password, user.password);
    console.log('Password comparison result:', isMatch);
    
    if (!isMatch) {
      console.log('Password mismatch');
      return res.status(401).json({ message: 'Invalid email/username or password.' });
    }

    console.log('Login successful:', { userId: user.id, displayName: user.display_name });
    let profilePictureUrl = user.profile_picture;
    if (profilePictureUrl && !profilePictureUrl.startsWith('http')) {
      profilePictureUrl = `${req.protocol}://${req.get('host')}/uploads/${profilePictureUrl.split('/').pop()}`;
    }
    console.log('LOGIN RESPONSE:', { 
      userId: user.id, 
      username: user.username,
      display_name: user.display_name,
      profile_picture: profilePictureUrl || null
    });
    res.status(200).json({ 
      message: 'Logged in successfully!', 
      userId: user.id, 
      username: user.username,
      display_name: user.display_name,
      profile_picture: profilePictureUrl || null
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

// Get All Posts endpoint
app.get('/posts', async (req, res) => {
  try {
    console.log('Fetching all posts');
    const posts = await dbAll(`
      SELECT 
        p.*,
        u.display_name,
        u.profile_picture as profile_picture,
        u.username as author_username,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count,
        (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) as is_liked
      FROM posts p
      LEFT JOIN users u ON p.userId = u.id
      ORDER BY p.timestamp DESC
    `, [req.query.userId || 0]);

    console.log(`Found ${posts.length} posts`);
    
    // Format the response
    const formattedPosts = posts.map(post => {
      // Log the post data for debugging
      console.log('Post data:', {
        id: post.id,
        userId: post.userId,
        username: post.username,
        author_username: post.author_username,
        display_name: post.display_name,
        profile_picture: post.profile_picture,
        full_post: post
      });

      // Ensure profile picture URL is absolute
      let profilePictureUrl = post.profile_picture;
      if (profilePictureUrl && !profilePictureUrl.startsWith('http')) {
        profilePictureUrl = `${req.protocol}://${req.get('host')}/uploads/${profilePictureUrl.split('/').pop()}`;
      }

      // Ensure media_url is absolute and file exists
      let mediaUrl = post.media_url;
      if (mediaUrl) {
        console.log(`Processing media for post ${post.id}:`, { originalUrl: mediaUrl });
        
        // Extract just the filename from any URL format
        const filename = mediaUrl.split('/').pop();
        const filePath = path.join(__dirname, 'uploads', 'posts', filename);
        console.log(`Checking file at path: ${filePath}`);
        
        if (fs.existsSync(filePath)) {
          // Always rebuild the URL with the current server's address
          mediaUrl = `${req.protocol}://${req.get('host')}/uploads/posts/${filename}`;
          console.log(`File exists, using URL: ${mediaUrl}`);
        } else {
          console.warn(`File not found: ${filePath}`);
          mediaUrl = null;
        }
      } else {
        console.log(`Post ${post.id} has no media`);
      }

      return {
        ...post,
        is_liked: post.is_liked > 0,
        timestamp: new Date(post.timestamp).toISOString(),
        media_url: mediaUrl || null,
        author: {
          username: post.author_username || post.username,
          display_name: post.display_name || post.username,
          profile_picture: profilePictureUrl || null
        }
      };
    });

    console.log('POSTS RESPONSE:', formattedPosts);
    res.json(formattedPosts);
  } catch (err) {
    console.error('Error fetching posts:', err);
    res.status(500).json({ message: 'Server error fetching posts.' });
  }
});

// Create Post endpoint
app.post('/posts', postUpload.single('media'), async (req, res) => {
  console.log('Received post creation request:', {
    body: req.body,
    file: req.file ? {
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size,
      mimetype: req.file.mimetype
    } : null
  });

  const { userId, username, content } = req.body;
  const mediaFile = req.file;

  // Input validation
  if (!userId || !username) {
    console.log('Missing required fields:', { userId, username });
    return res.status(400).json({ 
      success: false,
      message: 'User ID and username are required.' 
    });
  }

  if (!content && !mediaFile) {
    console.log('Post must have either content or media');
    return res.status(400).json({ 
      success: false,
      message: 'Post must contain either text content or media.' 
    });
  }

  let mediaUrl = null;
  if (mediaFile) {
    mediaUrl = `${req.protocol}://${req.get('host')}/uploads/posts/${mediaFile.filename}`;
    console.log('Generated media URL:', mediaUrl);
  }

  try {
    // Start transaction
    await dbRun('BEGIN TRANSACTION');
    
    try {
      // Insert the post
      const result = await dbRun(
        'INSERT INTO posts (userId, username, content, media_url) VALUES (?, ?, ?, ?)',
        [userId, username, content || null, mediaUrl]
      );
      
      if (!result || !result.lastID) {
        throw new Error('Failed to insert post: No lastID returned');
      }
      
      // Get the complete post with user info
      const post = await dbGet(`
        SELECT 
          p.*,
          u.display_name,
          u.profile_picture as profilePicture,
          u.username as author_username,
          COALESCE((SELECT COUNT(*) FROM likes WHERE post_id = p.id), 0) as likes_count,
          COALESCE((SELECT COUNT(*) FROM comments WHERE post_id = p.id), 0) as comments_count,
          CASE WHEN EXISTS (SELECT 1 FROM likes WHERE post_id = p.id AND user_id = ?) THEN 1 ELSE 0 END as is_liked
        FROM posts p
        LEFT JOIN users u ON p.userId = u.id
        WHERE p.id = ?
      `, [userId, result.lastID]);
      
      if (!post) {
        throw new Error('Failed to retrieve created post');
      }
      
      // Format the response
      const response = {
        success: true,
        post: {
          id: post.id,
          userId: post.userId,
          username: post.username,
          display_name: post.display_name,
          content: post.content,
          media_url: post.media_url,
          timestamp: post.timestamp || post.created_at,
          likes_count: post.likes_count || 0,
          comments_count: post.comments_count || 0,
          is_liked: post.is_liked || 0,
          author: {
            id: post.userId,
            username: post.username,
            display_name: post.display_name,
            profile_picture: post.profilePicture
          }
        }
      };
      
      // Commit the transaction
      await dbRun('COMMIT');
      
      console.log('New post created successfully:', {
        postId: post.id,
        userId: post.userId,
        hasMedia: !!post.media_url
      });
      
      return res.status(201).json(response);
      
    } catch (dbError) {
      // Rollback on error
      await dbRun('ROLLBACK');
      console.error('Database error during post creation:', dbError);
      throw dbError;
    }
  } catch (err) {
    console.error('Error creating post:', {
      message: err.message,
      stack: err.stack,
      userId,
      hasMedia: !!mediaFile
    });
    
    // Clean up uploaded file if it exists
    if (mediaFile && fs.existsSync(mediaFile.path)) {
      try {
        fs.unlinkSync(mediaFile.path);
        console.log('Cleaned up uploaded file after error:', mediaFile.filename);
      } catch (unlinkErr) {
        console.error('Error deleting uploaded file after error:', unlinkErr);
      }
    }
    
    // Provide more detailed error information in development
    const errorResponse = {
      success: false,
      message: 'Failed to create post',
      error: process.env.NODE_ENV === 'development' ? {
        message: err.message,
        ...(err.code && { code: err.code }),
        ...(err.sql && { sql: err.sql })
      } : undefined
    };
    
    return res.status(500).json(errorResponse);
  }
});

// Delete Post endpoint
app.delete('/posts/:id', async (req, res) => {
  const postId = req.params.id;
  try {
    // Optionally: delete associated media file
    const post = await dbGet('SELECT media_url FROM posts WHERE id = ?', [postId]);
    if (post && post.media_url) {
      const fileName = post.media_url.split('/').pop();
      const filePath = path.join(__dirname, 'uploads', 'posts', fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    // Delete the post
    const result = await dbRun('DELETE FROM posts WHERE id = ?', [postId]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting post:', err);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// Create Chat Group endpoint
app.post('/chat-groups', upload.single('image'), async (req, res) => {
  try {
    const { name, participants, description, code, type = 'group' } = req.body;
    const groupImage = req.file ? `/uploads/${req.file.filename}` : null;

    if (!name) {
      return res.status(400).json({ message: 'Group name is required.' });
    }

    // Parse and validate participants
    let participantIds = [];
    if (participants) {
      if (Array.isArray(participants)) {
        participantIds = participants;
      } else if (typeof participants === 'string') {
        try {
          const parsed = JSON.parse(participants);
          if (Array.isArray(parsed)) {
            participantIds = parsed;
          }
        } catch (error) {
          console.warn('Invalid participants format (string), defaulting to empty array');
        }
      } else {
        // Single id or unexpected type
        const maybeId = Number(participants);
        if (!Number.isNaN(maybeId)) participantIds = [maybeId];
      }
    }

    // For study groups, ensure we have at least one participant
    if (type === 'study_group' && participantIds.length === 0) {
      console.warn('No participants provided for study group, this should not happen');
    }

    // Filter out falsy/invalid IDs and normalize to numbers if possible
    const normalizedIds = participantIds
      .filter((id) => id !== null && id !== undefined && id !== '')
      .map((id) => (typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : Number(id)))
      .filter((n) => !Number.isNaN(n));

    // For non-study groups, require at least one valid participant
    if (normalizedIds.length === 0 && type !== 'study_group') {
      return res.status(400).json({ message: 'At least one valid participant is required.' });
    }

    // Create within a transaction for speed and atomicity
    await dbRun('BEGIN');
    
    // First, create the chat
    const chatResult = await dbRun(
      'INSERT INTO chats (type, name, group_image, description, code) VALUES (?, ?, ?, ?, ?)',
      [type, name, groupImage, description || null, code || null]
    );
    
    const chatId = chatResult.lastID;

    // Insert participants (for study_group, we allow empty but prefer to include provided creator if any)
    if (normalizedIds.length > 0) {
      for (const userId of normalizedIds) {
        await dbRun(
          'INSERT OR IGNORE INTO chat_participants (chat_id, user_id) VALUES (?, ?)',
          [chatId, userId]
        );
      }
    }
    
    await dbRun('COMMIT');

    // Fetch the created chat with all its details
    const chat = await dbGet('SELECT * FROM chats WHERE id = ?', [chatId]);
    const chatParticipants = await dbAll(
      'SELECT user_id FROM chat_participants WHERE chat_id = ?', 
      [chatId]
    );

    return res.status(201).json({
      message: type === 'study_group' ? 'Study group created successfully!' : 'Chat group created successfully!',
      chat: {
        id: chat.id,
        type: chat.type,
        name: chat.name,
        description: chat.description,
        code: chat.code,
        group_image: chat.group_image,
        created_at: chat.created_at,
        participants: chatParticipants.map(p => p.user_id)
      }
    });

  } catch (error) {
    console.error('Error creating chat group:', error);
    try { 
      await dbRun('ROLLBACK'); 
    } catch (rollbackError) {
      console.error('Error rolling back transaction:', rollbackError);
    }
    return res.status(500).json({ 
      message: 'Server error during group creation.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get user's chat groups
app.get('/chat-groups/:userId', async (req, res) => {
  const { userId } = req.params;

  const query = `
    SELECT g.*, 
           (SELECT content FROM messages 
            WHERE group_id = g.id 
            ORDER BY timestamp DESC 
            LIMIT 1) as last_message,
           (SELECT timestamp FROM messages 
            WHERE group_id = g.id 
            ORDER BY timestamp DESC 
            LIMIT 1) as last_message_time,
           (SELECT COUNT(*) FROM messages 
            WHERE group_id = g.id 
            AND timestamp > COALESCE(
              (SELECT last_read FROM group_members 
               WHERE group_id = g.id 
               AND user_id = ?), 
              '1970-01-01'
            )) as unread_count
    FROM chat_groups g
    JOIN group_members gm ON g.id = gm.group_id
    WHERE gm.user_id = ?
    ORDER BY last_message_time DESC NULLS LAST
  `;

  try {
    const rows = await dbAll(query, [userId, userId]);
    res.json(rows || []);
  } catch (err) {
    console.error('Error fetching chat groups:', err.message);
    res.status(500).json({ message: 'Server error fetching chat groups.' });
  }
});

// Get messages for a group
app.get('/chat-groups/:groupId/messages', async (req, res) => {
  const { groupId } = req.params;

  const query = `
    SELECT m.*, u.display_name as sender_name
    FROM messages m
    JOIN users u ON m.user_id = u.id
    WHERE m.group_id = ?
    ORDER BY m.timestamp ASC
  `;

  try {
    const rows = await dbAll(query, [groupId]);
    res.json(rows || []);
  } catch (err) {
    console.error('Error fetching messages:', err.message);
    res.status(500).json({ message: 'Server error fetching messages.' });
  }
});

// Get all users
app.get('/users', async (req, res) => {
  try {
    const rows = await dbAll('SELECT id, username, display_name FROM users', []);
    res.json(rows || []);
  } catch (err) {
    console.error('Error fetching users:', err.message);
    res.status(500).json({ message: 'Server error fetching users.' });
  }
});

// Send Message endpoint
app.post('/messages', async (req, res) => {
  const { groupId, userId, content } = req.body;

  if (!groupId || !userId || !content) {
    return res.status(400).json({ message: 'Group ID, user ID, and content are required.' });
  }

  try {
    const result = await dbRun('INSERT INTO messages (group_id, user_id, content) VALUES (?, ?, ?)', 
      [groupId, userId, content]);
    
    res.status(201).json({ 
      message: 'Message sent successfully!', 
      messageId: result.lastID 
    });
  } catch (err) {
    console.error('Error sending message:', err.message);
    res.status(500).json({ message: 'Server error sending message.' });
  }
});

// Get user's direct message conversations endpoint
app.get('/direct-messages/conversations/:userId', async (req, res) => {
  const { userId } = req.params;

  const query = `
    SELECT 
      u.id as other_user_id,
      u.username as other_username,
      u.display_name as other_display_name,
      u.avatar_url as other_avatar_url,
      (SELECT content FROM direct_messages 
       WHERE (sender_id = ? AND receiver_id = u.id) 
          OR (sender_id = u.id AND receiver_id = ?)
       ORDER BY timestamp DESC 
       LIMIT 1) as last_message,
      (SELECT timestamp FROM direct_messages 
       WHERE (sender_id = ? AND receiver_id = u.id) 
          OR (sender_id = u.id AND receiver_id = ?)
       ORDER BY timestamp DESC 
       LIMIT 1) as last_message_time,
      (SELECT COUNT(*) FROM direct_messages 
       WHERE sender_id = u.id 
         AND receiver_id = ? 
         AND is_read = 0) as unread_count
    FROM users u
    WHERE u.id IN (
      SELECT DISTINCT 
        CASE 
          WHEN sender_id = ? THEN receiver_id
          ELSE sender_id
        END as other_user_id
      FROM direct_messages
      WHERE sender_id = ? OR receiver_id = ?
    )
    AND u.id != ?
    GROUP BY other_user_id
    ORDER BY last_message_time DESC NULLS LAST
  `;

  try {
    const rows = await dbAll(query, [
      userId, userId, userId, userId, userId, userId, userId, userId, userId, userId
    ]);
    res.json(rows || []);
  } catch (err) {
    console.error('Error fetching conversations:', err.message);
    res.status(500).json({ message: 'Server error fetching conversations.' });
  }
});

// Add user to group endpoint
app.post('/chat-groups/:groupId/add-user', async (req, res) => {
  const { groupId } = req.params;
  const { userId } = req.body;

  const chatId = Number(groupId);
  const uid = Number(userId);

  if (!uid || Number.isNaN(uid)) {
    return res.status(400).json({ message: 'User ID is required.' });
  }

  try {
    const result = await dbRun('INSERT OR IGNORE INTO chat_participants (chat_id, user_id) VALUES (?, ?)', 
      [chatId, uid]);
    
    if (result.changes > 0) {
      res.status(201).json({ message: 'User added to chat successfully!' });
    } else {
      res.status(200).json({ message: 'User is already in the chat.' });
    }
  } catch (err) {
    console.error('Error adding user to chat (chat_participants):', err.message);
    res.status(500).json({ message: 'Server error adding user to group.' });
  }
});

// Update profile picture endpoint
// Update user profile picture
app.post('/users/:id/profile-picture', upload.single('profile_picture'), async (req, res) => {
  console.log('--- PROFILE PIC UPLOAD REQUEST ---');
  console.log('Headers:', req.headers);
  
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const userId = req.params.id;
  const filename = req.file.filename;
  console.log('File info:', req.file);
  
  try {
    // Update the user's profile picture in the database
    await dbRun('UPDATE users SET profile_picture = ? WHERE id = ?', [filename, userId]);
    
    // Construct the full URL for the uploaded image
    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${filename}`;
    console.log('Profile picture updated:', imageUrl);
    
    // Return the URL of the uploaded image
    res.json({ 
      success: true,
      profile_picture: imageUrl,
      message: 'Profile picture updated successfully' 
    });
  } catch (err) {
    console.error('Error updating profile picture:', err);
    res.status(500).json({ 
      success: false,
      message: 'Failed to update profile picture',
      error: err.message 
    });
  }
});

// Like/Unlike post endpoint
app.post('/posts/:postId/like', async (req, res) => {
  const { postId } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ message: 'User ID is required.' });
  }

  try {
    // Check if user already liked the post
    const existingLike = await dbGet('SELECT * FROM likes WHERE post_id = ? AND user_id = ?', [postId, userId]);
    
    if (existingLike) {
      // Unlike
      await dbRun('DELETE FROM likes WHERE post_id = ? AND user_id = ?', [postId, userId]);
      await dbRun('UPDATE posts SET likes_count = CASE WHEN likes_count > 0 THEN likes_count - 1 ELSE 0 END WHERE id = ?', [postId]);
      const updatedPost = await dbGet('SELECT likes_count FROM posts WHERE id = ?', [postId]);
      res.json({ 
        message: 'Post unliked successfully', 
        liked: false,
        likes_count: updatedPost.likes_count
      });
    } else {
      // Like
      await dbRun('INSERT INTO likes (post_id, user_id) VALUES (?, ?)', [postId, userId]);
      await dbRun('UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?', [postId]);
      const updatedPost = await dbGet('SELECT likes_count FROM posts WHERE id = ?', [postId]);
      res.json({ 
        message: 'Post liked successfully', 
        liked: true,
        likes_count: updatedPost.likes_count
      });
    }
  } catch (err) {
    console.error('Error handling like:', err);
    res.status(500).json({ message: 'Server error handling like.' });
  }
});

// Get comments for a post
app.get('/posts/:postId/comments', async (req, res) => {
  const { postId } = req.params;
  const { userId } = req.query;
  
  try {
    console.log('Fetching comments for post:', postId);
    
    // First, verify the post exists
    const post = await dbGet('SELECT id FROM posts WHERE id = ?', [postId]);
    if (!post) {
      console.log('Post not found:', postId);
      return res.status(404).json({ message: 'Post not found' });
    }

    const comments = await dbAll(`
        c.*, 
        u.display_name, 
        u.profile_picture as profilePicture, 
        u.username as author_username, 
        (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) as likes_count, 
        (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id AND user_id = ?) as is_liked 
      FROM comments c 
      LEFT JOIN users u ON c.user_id = u.id 
      WHERE c.post_id = ? 
      ORDER BY c.timestamp ASC
    `, [userId || 0, postId]);
    
    console.log('Found comments:', comments);
    
    if (!comments || comments.length === 0) {
      console.log('No comments found for post:', postId);
      return res.json([]);
    }
    
    // Format comments to include user info and parent_comment_id
    const formattedComments = comments.map(comment => {
      // Ensure profile picture URL is absolute
      let profilePictureUrl = comment.profile_picture || comment.profilePicture;
      if (profilePictureUrl && !profilePictureUrl.startsWith('http')) {
        profilePictureUrl = `${req.protocol}://${req.get('host')}/uploads/${profilePictureUrl.split('/').pop()}`;
      }
      return {
        id: comment.id,
        post_id: comment.post_id,
        user_id: comment.user_id,
        content: comment.content,
        timestamp: comment.timestamp,
        username: comment.username,
        display_name: comment.display_name || comment.username,
        profile_picture: profilePictureUrl || null,
        likes_count: comment.likes_count,
        is_liked: comment.is_liked > 0,
        parent_comment_id: comment.parent_comment_id,
        author: {
          username: comment.author_username || comment.username,
          display_name: comment.display_name || comment.username,
          profile_picture: profilePictureUrl || null
        }
      };
    });
    
    res.json(formattedComments);
  } catch (err) {
    console.error('Error fetching comments:', err);
    res.status(500).json({ message: 'Server error fetching comments.' });
  }
});

// Like/Unlike comment endpoint
app.post('/comments/:commentId/like', async (req, res) => {
  const { commentId } = req.params;
  const { userId } = req.body;

  console.log('Received comment like request:', { commentId, userId });

  if (!userId) {
    console.log('Missing userId in request');
    return res.status(400).json({ message: 'User ID is required.' });
  }

  try {
    // First verify the comment exists
    const comment = await dbGet('SELECT id FROM comments WHERE id = ?', [commentId]);
    if (!comment) {
      console.log('Comment not found:', commentId);
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Check if user already liked the comment
    const existingLike = await dbGet('SELECT * FROM comment_likes WHERE comment_id = ? AND user_id = ?', [commentId, userId]);
    console.log('Existing like check:', { commentId, userId, existingLike });
    
    if (existingLike) {
      // Unlike
      console.log('Removing like from comment:', commentId);
      await dbRun('DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?', [commentId, userId]);
      const updatedComment = await dbGet('SELECT (SELECT COUNT(*) FROM comment_likes WHERE comment_id = ?) as likes_count', [commentId]);
      console.log('Comment unliked successfully:', { commentId, likes_count: updatedComment.likes_count });
      res.json({ 
        message: 'Comment unliked successfully', 
        liked: false,
        likes_count: updatedComment.likes_count
      });
    } else {
      // Like
      console.log('Adding like to comment:', commentId);
      await dbRun('INSERT INTO comment_likes (comment_id, user_id) VALUES (?, ?)', [commentId, userId]);
      const updatedComment = await dbGet('SELECT (SELECT COUNT(*) FROM comment_likes WHERE comment_id = ?) as likes_count', [commentId]);
      console.log('Comment liked successfully:', { commentId, likes_count: updatedComment.likes_count });
      res.json({ 
        message: 'Comment liked successfully', 
        liked: true,
        likes_count: updatedComment.likes_count
      });
    }
  } catch (err) {
    console.error('Error handling comment like:', err);
    res.status(500).json({ 
      message: 'Server error handling comment like.',
      error: err.message 
    });
  }
});

// Add comment endpoint
app.post('/posts/:postId/comments', async (req, res) => {
  const { postId } = req.params;
  const { userId, username, content, parent_comment_id } = req.body;

  console.log('Received comment request:', {
    postId,
    userId,
    username,
    content,
    parent_comment_id,
    body: req.body
  });

  if (!userId || !username || !content) {
    console.log('Missing required fields:', { userId, username, content });
    return res.status(400).json({ message: 'User ID, username, and content are required.' });
  }

  try {
    console.log('Adding comment to database:', { postId, userId, username, content, parent_comment_id });
    const result = await dbRun(
      'INSERT INTO comments (post_id, user_id, username, content, parent_comment_id) VALUES (?, ?, ?, ?, ?)',
      [postId, userId, username, content, parent_comment_id || null]
    );
    console.log('Comment inserted with ID:', result.lastID);

    await dbRun('UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?', [postId]);
    console.log('Updated post comments count');
    
    const comment = await dbGet(
      'SELECT c.*, u.display_name, u.profile_picture as profilePicture FROM comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = ?',
      [result.lastID]
    );
    
    if (!comment) {
      console.error('Failed to retrieve created comment');
      throw new Error('Failed to retrieve created comment');
    }

    console.log('Retrieved created comment:', comment);

    const updatedPost = await dbGet('SELECT comments_count FROM posts WHERE id = ?', [postId]);
    console.log('Updated post:', updatedPost);
    
    // Format the profile picture URL
    let profilePictureUrl = comment.profile_picture || comment.profilePicture;
    if (profilePictureUrl && !profilePictureUrl.startsWith('http')) {
      profilePictureUrl = `${req.protocol}://${req.get('host')}/uploads/${profilePictureUrl.split('/').pop()}`;
    }

    const formattedComment = {
      ...comment,
      display_name: comment.display_name || comment.username,
      profile_picture: profilePictureUrl || null
    };

    console.log('Sending response with formatted comment:', formattedComment);
    res.status(201).json({
      ...formattedComment,
      comments_count: updatedPost.comments_count
    });
  } catch (err) {
    console.error('Error adding comment:', err);
    res.status(500).json({ message: 'Server error adding comment.' });
  }
});

// Chat Routes
app.post('/chats', async (req, res) => {
  try {
    console.log('POST /chats body:', req.body);
    const { type, name, participants, groupImage } = req.body;
    console.log('Type:', type, 'Participants:', participants);
    
    if (!type || !participants || !Array.isArray(participants) || participants.length < 2) {
      console.error('Invalid chat data:', req.body);
      return res.status(400).json({ error: 'Invalid chat data', details: req.body });
    }

    // For individual chats, check if a chat already exists between these two users
    if (type === 'individual' && participants.length === 2) {
      const existingChat = await dbGet(`
        SELECT c.id 
        FROM chats c
        JOIN chat_participants cp1 ON c.id = cp1.chat_id AND cp1.user_id = ?
        JOIN chat_participants cp2 ON c.id = cp2.chat_id AND cp2.user_id = ?
        WHERE c.type = 'individual'
      `, [participants[0], participants[1]]);
      
      if (existingChat) {
        console.log('Found existing chat:', existingChat.id);
        return res.json({ id: existingChat.id });
      }
    }

    // Create new chat
    const result = await dbRun(
      'INSERT INTO chats (type, name, group_image) VALUES (?, ?, ?)',
      [type, name, groupImage]
    );
    const chatId = result.lastID;
    
    // Add participants
    for (const userId of participants) {
      await dbRun(
        'INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?)',
        [chatId, userId]
      );
    }
    
    console.log('Created new chat:', chatId);
    res.json({ id: chatId });
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({ error: 'Failed to create chat', details: error.message });
  }
});

app.get('/chats', async (req, res) => {
  const userId = req.query.userId;
  const type = req.query.type; // Get the type filter if provided
  
  if (!userId) {
    return res.status(400).json({ message: 'User ID is required' });
  }
  
  try {
    // Base query to get all chats the user participates in
    let query = `
      SELECT c.* FROM chats c
      JOIN chat_participants cp ON c.id = cp.chat_id
      WHERE cp.user_id = ?
    `;
    
    const params = [userId];
    
    // Add type filter if provided
    if (type) {
      query += ' AND c.type = ?';
      params.push(type);
    }
    
    // Add ordering
    query += ' ORDER BY c.created_at DESC';
    
    // Execute the query
    const chats = await dbAll(query, params);
    // For each chat, get participants and lastMessage
    for (const chat of chats) {
      // Participants
      chat.participants = await dbAll(`
        SELECT u.id, u.username, u.display_name as displayName, u.profile_picture as profilePicture
        FROM users u
        JOIN chat_participants cp ON u.id = cp.user_id
        WHERE cp.chat_id = ?
      `, [chat.id]);
      // Last message
      chat.lastMessage = await dbGet(
        'SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT 1',
        [chat.id]
      );
      // For group chats, include groupImage as a full URL if present
      if (chat.type === 'group' && chat.group_image) {
        chat.groupImage = chat.group_image;
        if (chat.groupImage && !chat.groupImage.startsWith('http')) {
          chat.groupImage = `${req.protocol}://${req.get('host')}/uploads/${chat.groupImage.split('/').pop()}`;
        }
      }
    }
    res.json(chats);
  } catch (err) {
    console.error('Error fetching chats:', err);
    res.status(500).json({ message: 'Server error fetching chats.' });
  }
});

app.get('/chats/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    
    const messages = await dbAll(`
        m.id,
        m.chat_id,
        m.sender_id,
        m.content,
        m.type,
        m.media_url,
        m.created_at as timestamp,
        u.display_name as sender_name
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.chat_id = ?
      ORDER BY m.created_at ASC
      LIMIT 50
    `, [id]);
    
    // Ensure the response uses the same keys as the socket events
    const formattedMessages = messages.map(msg => ({
      ...msg,
      mediaUrl: msg.media_url
    }));

    res.json(formattedMessages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.post('/chats/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    
    await dbRun(`
      UPDATE chat_participants 
      SET last_read_at = CURRENT_TIMESTAMP
      WHERE chat_id = ? AND user_id = ?
    `, [id, userId]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
});

app.get('/users/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    const users = await dbAll(`
      SELECT 
        id,
        username,
        display_name as displayName,
        email,
        profile_picture as profilePicture
      FROM users
      WHERE username LIKE ? OR display_name LIKE ? OR email LIKE ?
      LIMIT 20
    `, [`%${q}%`, `%${q}%`, `%${q}%`]);
    
    res.json(users);
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

app.post('/chats/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const { chatId, senderId, content, type = 'text', mediaUrl } = req.body;
    
    if (!senderId || !content) {
      return res.status(400).json({ error: 'Sender ID and content are required' });
    }

    const result = await dbRun(
      'INSERT INTO messages (chat_id, sender_id, content, type, media_url) VALUES (?, ?, ?, ?, ?)',
      [id, senderId, content, type, mediaUrl]
    );

    const newMessage = {
      id: result.lastID,
      chatId: id,
      senderId,
      content,
      type,
      mediaUrl,
      timestamp: new Date().toISOString()
    };

    // Broadcast to all participants in the chat via Socket.IO
    io.to(`chat:${id}`).emit('message', newMessage);

    res.status(201).json(newMessage);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Cleanup duplicate individual chats endpoint
app.post('/chats/cleanup-duplicates', async (req, res) => {
  try {
    console.log('Starting duplicate chat cleanup...');
    
    // Find duplicate individual chats
    const duplicates = await dbAll(`
      SELECT 
        cp1.user_id as user1,
        cp2.user_id as user2,
        GROUP_CONCAT(c.id) as chat_ids
      FROM chats c
      JOIN chat_participants cp1 ON c.id = cp1.chat_id
      JOIN chat_participants cp2 ON c.id = cp2.chat_id
      WHERE c.type = 'individual' 
        AND cp1.user_id < cp2.user_id
      GROUP BY cp1.user_id, cp2.user_id
      HAVING COUNT(*) > 1
    `);
    
    let cleanedCount = 0;
    
    for (const duplicate of duplicates) {
      const chatIds = duplicate.chat_ids.split(',').map(id => parseInt(id));
      
      // Keep the first chat (lowest ID) and delete the rest
      const chatsToDelete = chatIds.slice(1);
      
      for (const chatId of chatsToDelete) {
        // Move messages to the first chat
        await dbRun(`
          UPDATE messages 
          SET chat_id = ? 
          WHERE chat_id = ?
        `, [chatIds[0], chatId]);
        
        // Delete the duplicate chat
        await dbRun('DELETE FROM chats WHERE id = ?', [chatId]);
        cleanedCount++;
      }
    }
    
    console.log(`Cleaned up ${cleanedCount} duplicate chats`);
    res.json({ 
      success: true, 
      cleanedCount,
      message: `Cleaned up ${cleanedCount} duplicate chats` 
    });
  } catch (error) {
    console.error('Error cleaning up duplicate chats:', error);
    res.status(500).json({ error: 'Failed to cleanup duplicate chats' });
  }
});

// Profile picture upload endpoint
app.post('/api/users/upload-profile-pic', upload.single('profilePicture'), async (req, res) => {
  try {
    const userId = req.body.userId || req.query.userId;
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required.' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded.' });
    }
    const profilePicPath = `/uploads/${req.file.filename}`;
    await dbRun('UPDATE users SET profile_picture = ? WHERE id = ?', [profilePicPath, userId]);
    res.status(200).json({ message: 'Profile picture updated.', profilePicture: profilePicPath });
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    res.status(500).json({ message: 'Server error uploading profile picture.' });
  }
});

// --- REST API for message deletion ---
app.delete('/api/messages/:id', async (req, res) => {
  try {
    const messageId = req.params.id;
    const userId = req.body.userId || req.query.userId;
    if (!userId) return res.status(400).json({ message: 'User ID required.' });
    const message = await dbGet('SELECT * FROM messages WHERE id = ?', [messageId]);
    if (!message) return res.status(404).json({ message: 'Message not found.' });
    if (message.sender_id?.toString() !== userId?.toString()) return res.status(403).json({ message: 'Not authorized.' });
    await dbRun('DELETE FROM messages WHERE id = ?', [messageId]);
    io.to(`chat:${message.chat_id}`).emit('messageDeleted', { messageId });
    res.status(200).json({ message: 'Message deleted.' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ message: 'Server error deleting message.' });
  }
});

// --- REST API for user status ---
app.get('/api/users/:id/status', (req, res) => {
  const userId = req.params.id;
  const status = userStatus[userId] || 'offline';
  res.json({ userId, status });
});

// Chat file upload endpoint
app.post('/api/upload', chatUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/chats/${req.file.filename}`;
    res.json({ fileUrl });
  } catch (error) {
    console.error('Chat file upload error:', error);
    res.status(500).json({ message: 'Server error uploading file.' });
  }
});

// GET a single chat by ID, including participants
app.get('/chats/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.query.userId;

  if (!userId) {
    return res.status(401).json({ message: 'User not authenticated' });
  }

  try {
    const chat = await dbGet('SELECT * FROM chats WHERE id = ?', [id]);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Check if the user is a participant of the chat
    const participant = await dbGet(
      'SELECT * FROM chat_participants WHERE chat_id = ? AND user_id = ?',
      [id, userId]
    );

    if (!participant) {
      return res.status(403).json({ message: 'User is not a participant of this chat' });
    }

    const participants = await dbAll(`
      SELECT u.id, u.username, u.display_name as displayName, u.profile_picture as profilePicture
      FROM users u
      JOIN chat_participants cp ON u.id = cp.user_id
      WHERE cp.chat_id = ?
    `, [id]);

    res.json({ ...chat, participants });
  } catch (error) {
    console.error('Error fetching chat:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload a document (notes/assignment)
app.post('/api/documents/upload', documentUpload.single('file'), async (req, res) => {
  try {
    const { title, courseCode, level, semester, docType, uploaderName } = req.body;
    if (!req.file || !title) {
      return res.status(400).json({ message: 'File and title are required.' });
    }
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/documents/${req.file.filename}`;
    const fileType = req.file.mimetype;
    const createdAt = Date.now();
    const result = await dbRun(
      `INSERT INTO documents (title, courseCode, level, semester, docType, uploaderName, fileUrl, fileType, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, courseCode, level, semester, docType, uploaderName, fileUrl, fileType, createdAt]
    );
    res.status(201).json({
      id: result.lastID,
      title, courseCode, level, semester, docType, uploaderName, fileUrl, fileType, createdAt
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ message: 'Server error uploading document.' });
  }
});

// List all documents (notes/assignments)
app.get('/api/documents', async (req, res) => {
  try {
    const docs = await dbAll('SELECT * FROM documents ORDER BY createdAt DESC');
    res.json(docs);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ message: 'Server error fetching documents.' });
  }
});

// Serve uploaded documents statically
app.use('/uploads/documents', express.static(path.join(__dirname, 'uploads/documents')));

// Announcements API
app.get('/api/announcements', async (req, res) => {
  try {
    console.log('Fetching announcements...');
    
    // First, check if the announcements table exists and get its structure
    let tableInfo = [];
    try {
      tableInfo = await dbAll("PRAGMA table_info(announcements)");
      console.log('Announcements table columns:', tableInfo.map(col => col.name).join(', '));
    } catch (err) {
      console.log('Announcements table does not exist, creating it...');
    }
    
    // If table doesn't exist or has no columns, create it with the correct schema
    if (tableInfo.length === 0) {
      console.log('Creating announcements table with default schema...');
      await dbRun(`CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        author_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        category TEXT,
        attachment_url TEXT,
        likes INTEGER DEFAULT 0,
        likedBy TEXT DEFAULT '[]',
        bookmarkedBy TEXT DEFAULT '[]',
        FOREIGN KEY (author_id) REFERENCES users(id)
      )`);
      // Refresh table info after creation
      tableInfo = await dbAll("PRAGMA table_info(announcements)");
    }
    
    // Ensure we have all required columns
    const hasTitle = tableInfo.some(col => col.name === 'title');
    const hasContent = tableInfo.some(col => col.name === 'content' || col.name === 'message');
    const hasAuthor = tableInfo.some(col => col.name === 'author' || col.name === 'author_id');
    const hasDate = tableInfo.some(col => col.name === 'date' || col.name === 'created_at');
    
    console.log('Table structure check:', {
      hasTitle,
      hasContent,
      hasAuthor,
      hasDate,
      allColumns: tableInfo.map(col => col.name)
    });

    try {
      // Determine the actual column names in the table
      const hasAuthor = tableInfo.some(col => col.name === 'author');
      const hasAuthorId = tableInfo.some(col => col.name === 'author_id');
      const hasDate = tableInfo.some(col => col.name === 'date');
      const hasCreatedAt = tableInfo.some(col => col.name === 'created_at');
      const hasMessage = tableInfo.some(col => col.name === 'message');
      const hasContent = tableInfo.some(col => col.name === 'content');
      
      let rows;
      
      // Build the query based on the actual schema
      if (hasAuthor) {
        // If we have an author column (username/display_name)
        console.log('Querying with author column...');
        rows = await dbAll(`
          SELECT a.*, u.profile_picture
          FROM announcements a
          LEFT JOIN users u ON a.author = u.username OR a.author = u.display_name
          ORDER BY ${hasDate ? 'a.date' : 'a.created_at'} DESC
        `);
      } else if (hasAuthorId) {
        // If we have an author_id (foreign key to users table)
        console.log('Querying with author_id column...');
        rows = await dbAll(`
          SELECT a.*, u.username as author, u.profile_picture
          FROM announcements a
          LEFT JOIN users u ON a.author_id = u.id
          ORDER BY ${hasDate ? 'a.date' : 'a.created_at'} DESC
        `);
      } else {
        // Fallback - no author information
        console.log('Querying without author information...');
        rows = await dbAll(`
          SELECT *, NULL as profile_picture
          FROM announcements
          ORDER BY ${hasDate ? 'date' : 'created_at'} DESC
        `);
      }
      
      // Ensure all rows have required fields with defaults
      rows = rows.map(row => ({
        id: row.id,
        title: row.title || 'No Title',
        message: row.message || row.content || '',
        author: row.author || 'Unknown',
        date: row.date || row.created_at || Date.now(),
        category: row.category || 'general',
        attachmentUrl: row.attachment_url || row.attachmentUrl || null,
        likes: row.likes || 0,
        likedBy: row.likedBy || '[]',
        bookmarkedBy: row.bookmarkedBy || '[]',
        profile_picture: row.profile_picture || null
      }));
      console.log(`Found ${rows.length} announcements`);
      
      // Parse JSON fields and format response
      const announcements = rows.map(row => {
        try {
          let profilePictureUrl = row.profile_picture;
          if (profilePictureUrl && !profilePictureUrl.startsWith('http') && profilePictureUrl !== 'null' && profilePictureUrl !== 'undefined') {
            profilePictureUrl = `${req.protocol}://${req.get('host')}/uploads/${profilePictureUrl.split('/').pop()}`;
          }
          
          // Parse JSON fields with error handling
          let likedBy = [];
          try {
            likedBy = typeof row.likedBy === 'string' ? JSON.parse(row.likedBy) : (row.likedBy || []);
          } catch (e) {
            console.error('Error parsing likedBy:', e);
            likedBy = [];
          }
          
          let bookmarkedBy = [];
          try {
            bookmarkedBy = typeof row.bookmarkedBy === 'string' ? JSON.parse(row.bookmarkedBy) : (row.bookmarkedBy || []);
          } catch (e) {
            console.error('Error parsing bookmarkedBy:', e);
            bookmarkedBy = [];
          }
          
          return {
            ...row,
            likedBy: likedBy,
            bookmarkedBy: bookmarkedBy,
            profile_picture: profilePictureUrl || null,
          };
        } catch (parseErr) {
          console.error('Error parsing announcement data:', parseErr, 'Row data:', row);
          // Return a sanitized version of the row without the problematic fields
          return {
            ...row,
            likedBy: [],
            bookmarkedBy: [],
            profile_picture: null,
            _parseError: 'Error parsing announcement data'
          };
        }
      });
      
      res.json(announcements);
    } catch (queryErr) {
      console.error('Database query error:', queryErr);
      throw queryErr;
    }
  } catch (err) {
    console.error('Error in /api/announcements:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
      errno: err.errno
    });
    res.status(500).json({ 
      error: 'Failed to fetch announcements',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// POST route to create a new announcement (with file upload support)
app.post('/api/announcements', upload.single('attachment'), async (req, res) => {
  try {
    const { title, message, author, category } = req.body;
    if (!title || !message || !author || !category) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    // Ensure announcements table exists
    await dbRun(`CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      author TEXT NOT NULL,
      date INTEGER NOT NULL,
      category TEXT NOT NULL,
      attachmentUrl TEXT,
      likes INTEGER DEFAULT 0,
      bookmarkedBy TEXT DEFAULT '[]'
    )`);
    const date = Date.now();
    let attachmentUrl = null;
    if (req.file) {
      attachmentUrl = `/uploads/${req.file.filename}`;
    }
    const result = await dbRun(
      `INSERT INTO announcements (title, message, author, date, category, attachmentUrl) VALUES (?, ?, ?, ?, ?, ?)`,
      [title, message, author, date, category, attachmentUrl]
    );
    res.status(201).json({
      id: result.lastID,
      title, message, author, date, category, attachmentUrl, likes: 0, bookmarkedBy: []
    });
  } catch (err) {
    console.error('Error creating announcement:', err);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

// Like an announcement (toggle like)
app.post('/api/announcements/:id/like', async (req, res) => {
  const announcementId = req.params.id;
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }
  try {
    const announcement = await dbGet('SELECT * FROM announcements WHERE id = ?', [announcementId]);
    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    let likedBy = [];
    try { likedBy = JSON.parse(announcement.likedBy || '[]'); } catch { likedBy = []; }
    if (!likedBy.includes(userId)) {
      likedBy.push(userId);
      await dbRun('UPDATE announcements SET likes = likes + 1, likedBy = ? WHERE id = ?', [JSON.stringify(likedBy), announcementId]);
    } else {
      likedBy = likedBy.filter(id => id !== userId);
      await dbRun('UPDATE announcements SET likes = likes - 1, likedBy = ? WHERE id = ?', [JSON.stringify(likedBy), announcementId]);
    }
    res.json({ success: true, likes: likedBy.length, likedBy });
  } catch (err) {
    console.error('Error liking announcement:', err);
    res.status(500).json({ error: 'Failed to like announcement' });
  }
});

// Bookmark an announcement (toggle bookmark)
app.post('/api/announcements/:id/bookmark', async (req, res) => {
  const announcementId = req.params.id;
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }
  try {
    // Ensure announcements table exists
    await dbRun(`CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      author TEXT NOT NULL,
      date INTEGER NOT NULL,
      category TEXT NOT NULL,
      attachmentUrl TEXT,
      likes INTEGER DEFAULT 0,
      bookmarkedBy TEXT DEFAULT '[]'
    )`);
    // Get the announcement
    const announcement = await dbGet('SELECT * FROM announcements WHERE id = ?', [announcementId]);
    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    // Parse bookmarkedBy as array
    let bookmarkedBy = [];
    try {
      bookmarkedBy = JSON.parse(announcement.bookmarkedBy || '[]');
    } catch {
      bookmarkedBy = [];
    }
    // Toggle bookmark
    if (!bookmarkedBy.includes(userId)) {
      bookmarkedBy.push(userId);
    } else {
      bookmarkedBy = bookmarkedBy.filter(id => id !== userId);
    }
    await dbRun('UPDATE announcements SET bookmarkedBy = ? WHERE id = ?', [JSON.stringify(bookmarkedBy), announcementId]);
    res.json({ success: true, bookmarkedBy });
  } catch (err) {
    console.error('Error bookmarking announcement:', err);
    res.status(500).json({ error: 'Failed to bookmark announcement' });
  }
});

// Delete an announcement
app.delete('/api/announcements/:id', async (req, res) => {
  const announcementId = req.params.id;
  try {
    // Ensure announcements table exists
    await dbRun(`CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      author TEXT NOT NULL,
      date INTEGER NOT NULL,
      category TEXT NOT NULL,
      attachmentUrl TEXT,
      likes INTEGER DEFAULT 0,
      bookmarkedBy TEXT DEFAULT '[]'
    )`);
    // Delete the announcement
    const result = await dbRun('DELETE FROM announcements WHERE id = ?', [announcementId]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting announcement:', err);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

// GET /events - fetch all events, split into featured and upcoming
app.get('/events', async (req, res) => {
  try {
    const events = await dbAll('SELECT * FROM events ORDER BY date ASC, time ASC');
    console.log('DEBUG all events:', events);
    const featured = events.filter(e => e.isFeatured);
    const upcoming = events.filter(e => !e.isFeatured);
    // Prepend full image URL if needed
    const makeImageUrl = img => img && !img.startsWith('http') ? `${req.protocol}://${req.get('host')}/uploads/events/${img}` : img;
    const mapEvent = e => ({ ...e, image: makeImageUrl(e.image), isFeatured: !!e.isFeatured });
    res.json({
      featured: featured.map(mapEvent),
      upcoming: upcoming.map(mapEvent)
    });
  } catch (err) {
    console.error('Error fetching events:', err);
    res.status(500).json({ message: 'Server error fetching events.' });
  }
});

// POST /events - create a new event (with image upload)
app.post('/events', eventUpload.single('image'), async (req, res) => {
  try {
    const { title, description, date, time, location, category, isFeatured } = req.body;
    if (!title || !date || !time || !location || !category) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }
    const image = req.file ? req.file.filename : null;
    const result = await dbRun(
      `INSERT INTO events (title, image, description, date, time, location, category, isFeatured) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, image, description, date, time, location, category, String(isFeatured) === '1' ? 1 : 0]
    );
    res.status(201).json({
      id: result.lastID,
      title, image, description, date, time, location, category, isFeatured: !!isFeatured
    });
  } catch (err) {
    console.error('Error creating event:', err);
    res.status(500).json({ message: 'Server error creating event.' });
  }
});

// Add this endpoint if not present:
app.get('/users/:id', async (req, res) => {
  const userId = req.params.id;
  try {
    const user = await dbGet('SELECT id, username, display_name, profile_picture FROM users WHERE id = ?', [userId]);
    let profilePictureUrl = user && user.profile_picture;
    if (profilePictureUrl && !profilePictureUrl.startsWith('http')) {
      profilePictureUrl = `${req.protocol}://${req.get('host')}/uploads/${profilePictureUrl.split('/').pop()}`;
    }
    const response = { ...user, profile_picture: profilePictureUrl || null };
    console.log('USER INFO RESPONSE:', response);
    res.json(response);
  } catch (err) {
    console.error('Error fetching user info:', err);
    res.status(500).json({ message: 'Server error fetching user info.' });
  }
});

// --- Create Forum Thread Endpoint ---
app.post('/forum-threads', async (req, res) => {
  const { title, content, category, author_id, author_name } = req.body;
  if (!title || !content || !category || !author_id || !author_name) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }
  try {
    const result = await dbRun(
      'INSERT INTO forum_threads (title, content, category, author_id, author_name) VALUES (?, ?, ?, ?, ?)',
      [title, content, category, author_id, author_name]
    );
    const thread = await dbGet('SELECT * FROM forum_threads WHERE id = ?', [result.lastID]);
    res.status(201).json(thread);
  } catch (err) {
    console.error('Error creating forum thread:', err);
    res.status(500).json({ message: 'Server error creating forum thread.' });
  }
});

// --- Get Forum Threads Endpoint ---
app.get('/forum-threads', async (req, res) => {
  const { category } = req.query;
  try {
    let threads;
    if (category) {
      threads = await dbAll('SELECT * FROM forum_threads WHERE category = ? ORDER BY timestamp DESC', [category]);
    } else {
      threads = await dbAll('SELECT * FROM forum_threads ORDER BY timestamp DESC');
    }
    res.json(threads);
  } catch (err) {
    console.error('Error fetching forum threads:', err);
    res.status(500).json({ message: 'Server error fetching forum threads.' });
  }
});

// --- Add Forum Comment Endpoint ---
app.post('/forum-threads/:threadId/comments', async (req, res) => {
  const { threadId } = req.params;
  const { user_id, username, content, parent_comment_id } = req.body;
  if (!user_id || !username || !content) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }
  try {
    const result = await dbRun(
      'INSERT INTO forum_comments (thread_id, user_id, username, content, parent_comment_id) VALUES (?, ?, ?, ?, ?)',
      [threadId, user_id, username, content, parent_comment_id || null]
    );
    const comment = await dbGet('SELECT * FROM forum_comments WHERE id = ?', [result.lastID]);
    res.status(201).json(comment);
  } catch (err) {
    console.error('Error creating forum comment:', err);
    res.status(500).json({ message: 'Server error creating forum comment.' });
  }
});

// --- Get Forum Comments Endpoint ---
app.get('/forum-threads/:threadId/comments', async (req, res) => {
  const { threadId } = req.params;
  try {
    const comments = await dbAll('SELECT * FROM forum_comments WHERE thread_id = ? ORDER BY timestamp ASC', [threadId]);
    res.json(comments);
  } catch (err) {
    console.error('Error fetching forum comments:', err);
    res.status(500).json({ message: 'Server error fetching forum comments.' });
  }
});

// --- Get All Users Endpoint (for @ mention autocomplete) ---
// Note: This endpoint is already defined above, so we're removing this duplicate definition

// --- Upvote/Like a Forum Thread Endpoint ---
app.post('/forum-threads/:id/upvote', async (req, res) => {
  const { id } = req.params;
  const { increment = true } = req.body;
  try {
    await dbRun(
      `UPDATE forum_threads SET upvotes = CASE WHEN upvotes IS NULL THEN 1 ELSE upvotes + (${increment ? 1 : -1}) END WHERE id = ?`,
      [id]
    );
    const thread = await dbGet('SELECT * FROM forum_threads WHERE id = ?', [id]);
    res.json(thread);
  } catch (err) {
    console.error('Error upvoting thread:', err);
    res.status(500).json({ message: 'Server error upvoting thread.' });
  }
});

// Test route
app.get('/test', (req, res) => {
  console.log('Test endpoint hit!');
  res.json({ status: 'success', message: 'Backend is working!' });
});

// Global error handler (after routes) to return JSON for Multer errors
app.use((err, req, res, next) => {
  if (err && err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File too large. Max allowed size is 50MB.' });
    }
    return res.status(400).json({ message: err.message || 'Upload error.' });
  }
  next(err);
});

// Server configuration - Always listen on all network interfaces
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0'; // This ensures the server listens on all available network interfaces

// Start the application
async function startServer() {
  try {
    await initializeServer();
    
    // Create HTTP server
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
      console.log(`API Documentation available at http://0.0.0.0:${PORT}/api-docs`);
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Please kill the process using this port or use a different port.`);
      } else {
        console.error('Server error:', error);
      }
      process.exit(1);
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Endpoint to get all tutors
app.get('/tutors', async (req, res) => {
  try {
    // Get all users who are tutors
    const tutors = await dbAll(`
      SELECT u.id, u.username, u.display_name as displayName, u.profile_picture as profilePicture,
             u.bio, u.department, u.courses
      FROM users u
      WHERE u.role = 'tutor' OR u.role = 'instructor' OR u.role = 'professor'
    `);
    
    res.json(tutors || []);
  } catch (err) {
    console.error('Error fetching tutors:', err);
    res.status(500).json({ message: 'Server error fetching tutors.' });
  }
});

// New endpoint to get all study groups for joining (doesn't require user participation)
app.get('/study-groups', async (req, res) => {
  try {
    // Get all study groups with additional details in a single query
    const query = `
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM chat_participants WHERE chat_id = c.id) as participants_count,
        (SELECT content FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM chats c
      WHERE c.type = 'study_group'
      ORDER BY c.created_at DESC
    `;
    
    const studyGroups = await dbAll(query);
    
    // Format the response with consistent structure
    const formattedGroups = await Promise.all(studyGroups.map(async (group) => {
      // Get participants (limited to first 5 for preview)
      const participants = await dbAll(`
        SELECT u.id, u.username, u.display_name as displayName, u.profile_picture as profilePicture
        FROM users u
        JOIN chat_participants cp ON u.id = cp.user_id
        WHERE cp.chat_id = ?
        LIMIT 5
      `, [group.id]);
      
      // Format tutor info if available
      const tutor = group.tutor_name ? {
        name: group.tutor_name,
        avatar: group.tutor_avatar ? 
          (group.tutor_avatar.startsWith('http') ? 
            group.tutor_avatar : 
            `${req.protocol}://${req.get('host')}/uploads/${group.tutor_avatar.split('/').pop()}`) :
          null
      } : null;
      
      // Format meeting days
      const meetingDays = group.meeting_days ? 
        group.meeting_days.split(',').map(day => day.trim()) : [];
      
      // Format group image URL
      const image = group.group_image ? 
        (group.group_image.startsWith('http') ? 
          group.group_image : 
          `${req.protocol}://${req.get('host')}/uploads/${group.group_image.split('/').pop()}`) :
        null;
      
      return {
        id: group.id,
        name: group.name,
        description: group.description,
        code: group.code,
        type: group.type,
        createdAt: group.created_at,
        updatedAt: group.updated_at,
        memberCount: group.participants_count || 0,
        lastMessage: group.last_message,
        meetingDays,
        tutor,
        image,
        participants
      };
    }));
    
    res.json(formattedGroups);
  } catch (err) {
    console.error('Error fetching study groups:', err);
    res.status(500).json({ message: 'Server error fetching study groups.' });
  }
});