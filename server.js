import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import os from 'os';
import path from 'path';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { WebSocketService } from './services/websocket.js';
import { 
  User, 
  Post, 
  Comment, 
  Chat, 
  Message, 
  Event, 
  Notification 
} from './models/index.js';

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/campusOS', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;

db.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

db.once('open', () => {
  console.log('Connected to MongoDB');
});

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
const httpServer = require('http').createServer(app);

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Enable CORS with specific configuration
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Content-Length', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200 // Some legacy browsers (IE11, various SmartTVs) choke on 204
};

// Apply CORS to all routes
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Parse JSON bodies for all requests
app.use(express.json());

// Configure CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

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

// Import routes
import pollsRouter from './routes/polls.js';

// ... rest of the code remains the same ...
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

// Server configuration
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Start the application
initializeServer();

// New endpoint to get all study groups for joining (doesn't require user participation)
app.get('/study-groups', async (req, res) => {
  try {
    // Get all study groups
    const query = `
      SELECT c.* FROM chats c
      WHERE c.type = 'study_group'
      ORDER BY c.created_at DESC
    `;
    
    const studyGroups = await dbAll(query);
    
    // For each study group, get participants count and basic info
    for (const group of studyGroups) {
      // Get participant count
      const participantCount = await dbGet(
        'SELECT COUNT(*) as count FROM chat_participants WHERE chat_id = ?',
        [group.id]
      );
      group.participants_count = participantCount.count;
      
      // Get participants list (for display purposes)
      group.participants = await dbAll(`
        SELECT u.id, u.username, u.display_name as displayName, u.profile_picture as profilePicture
        FROM users u
        JOIN chat_participants cp ON u.id = cp.user_id
        WHERE cp.chat_id = ?
      `, [group.id]);
      
      // For group chats, include groupImage as a full URL if present
      if (group.group_image) {
        group.groupImage = group.group_image;
        if (group.groupImage && !group.groupImage.startsWith('http')) {
          group.groupImage = `${req.protocol}://${req.get('host')}/uploads/${group.groupImage.split('/').pop()}`;
        }
      }
    }
    
    res.json(studyGroups);
  } catch (err) {
    console.error('Error fetching study groups:', err);
    res.status(500).json({ message: 'Server error fetching study groups.' });
  }
});