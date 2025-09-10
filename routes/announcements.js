import express from 'express';
import multer from 'multer';
import { dbRun, dbAll, dbGet } from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Get all announcements
router.get('/', async (req, res) => {
  try {
    console.log('Fetching announcements...');
    
    // Check if announcements table exists
    let tableInfo = [];
    try {
      tableInfo = await dbAll("PRAGMA table_info(announcements)");
    } catch (err) {
      if (err.code === 'SQLITE_ERROR' && err.message.includes('no such table')) {
        // Table doesn't exist, create it
        await dbRun(`
          CREATE TABLE IF NOT EXISTS announcements (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            author_id TEXT NOT NULL,
            author_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            attachment_url TEXT,
            attachment_name TEXT,
            is_pinned INTEGER DEFAULT 0
          )
        `);
      } else {
        throw err;
      }
    }

    // Get announcements with pagination
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await dbGet('SELECT COUNT(*) as count FROM announcements');
    const total = countResult ? countResult.count : 0;

    // Get announcements
    const announcements = await dbAll(
      `SELECT * FROM announcements 
       ORDER BY is_pinned DESC, created_at DESC 
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    res.json({
      success: true,
      data: announcements,
      pagination: {
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Error in /api/announcements:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
    });
    res.status(500).json({
      success: false,
      message: 'Failed to fetch announcements',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Create a new announcement (with file upload support)
router.post('/', multer().single('attachment'), async (req, res) => {
  const { title, content, authorId, authorName, isPinned } = req.body;
  const file = req.file;
  
  if (!title || !content || !authorId || !authorName) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: title, content, authorId, authorName'
    });
  }

  try {
    // Handle file upload if present
    let attachmentUrl = null;
    let attachmentName = null;
    
    if (file) {
      // In a real app, you would upload to Cloudinary here
      // For now, we'll just store the file info
      attachmentName = file.originalname;
      attachmentUrl = `/uploads/announcements/${Date.now()}-${file.originalname}`;
      // TODO: Implement actual file upload to Cloudinary
    }

    // Insert announcement
    const announcementId = uuidv4();
    await dbRun(
      `INSERT INTO announcements 
       (id, title, content, author_id, author_name, is_pinned, attachment_url, attachment_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        announcementId,
        title,
        content,
        authorId,
        authorName,
        isPinned ? 1 : 0,
        attachmentUrl,
        attachmentName
      ]
    );

    // Get the created announcement
    const newAnnouncement = await dbGet(
      'SELECT * FROM announcements WHERE id = ?',
      [announcementId]
    );

    // Emit WebSocket event
    if (req.app.get('webSocketService')) {
      req.app.get('webSocketService').io.emit('new_announcement', newAnnouncement);
    }

    res.status(201).json({
      success: true,
      data: newAnnouncement
    });
  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create announcement'
    });
  }
});

// Delete an announcement
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    // First, check if the announcement exists
    const announcement = await dbGet(
      'SELECT * FROM announcements WHERE id = ?',
      [id]
    );

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    // Delete the announcement
    await dbRun('DELETE FROM announcements WHERE id = ?', [id]);

    // Emit WebSocket event
    if (req.app.get('webSocketService')) {
      req.app.get('webSocketService').io.emit('announcement_deleted', { id });
    }

    res.json({
      success: true,
      message: 'Announcement deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting announcement:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete announcement'
    });
  }
});

export default router;
