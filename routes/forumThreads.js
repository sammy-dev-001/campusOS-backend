import express from 'express';
import { dbRun, dbAll, dbGet } from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Get all forum threads with optional category filter
router.get('/', async (req, res) => {
  try {
    const { category, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = 'FROM forum_threads';
    const params = [];
    
    if (category) {
      query += ' WHERE category = ?';
      params.push(category);
    }
    
    // Get total count
    const countResult = await dbGet(`SELECT COUNT(*) as count ${query}`, params);
    const total = countResult ? countResult.count : 0;
    
    // Get threads with author info and latest post
    const threads = await dbAll(
      `SELECT 
        t.*, 
        u.username as author_name,
        u.profile_pic as author_avatar,
        (SELECT COUNT(*) FROM forum_posts WHERE thread_id = t.id) as post_count,
        (SELECT created_at FROM forum_posts 
         WHERE thread_id = t.id 
         ORDER BY created_at DESC LIMIT 1) as last_activity
       ${query}
       ORDER BY 
         CASE WHEN t.is_pinned = 1 THEN 0 ELSE 1 END,
         last_activity DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    
    res.json({
      success: true,
      data: threads,
      pagination: {
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching forum threads:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch forum threads'
    });
  }
});

// Create a new forum thread
router.post('/', async (req, res) => {
  const { title, content, category, authorId, authorName, isPinned = false } = req.body;
  
  if (!title || !content || !category || !authorId || !authorName) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: title, content, category, authorId, authorName'
    });
  }
  
  try {
    // Start transaction
    await dbRun('BEGIN TRANSACTION');
    
    // Create thread
    const threadId = uuidv4();
    await dbRun(
      `INSERT INTO forum_threads 
       (id, title, category, author_id, author_name, is_pinned)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [threadId, title, category, authorId, authorName, isPinned ? 1 : 0]
    );
    
    // Create first post
    const postId = uuidv4();
    await dbRun(
      `INSERT INTO forum_posts 
       (id, thread_id, content, author_id, author_name)
       VALUES (?, ?, ?, ?, ?)`,
      [postId, threadId, content, authorId, authorName]
    );
    
    // Update thread with first post info
    await dbRun(
      `UPDATE forum_threads 
       SET last_post_id = ?, post_count = 1, last_activity = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [postId, threadId]
    );
    
    await dbRun('COMMIT');
    
    // Get the created thread with full details
    const newThread = await dbGet(
      `SELECT t.*, u.username as author_name, u.profile_pic as author_avatar
       FROM forum_threads t
       LEFT JOIN users u ON t.author_id = u.id
       WHERE t.id = ?`,
      [threadId]
    );
    
    // Emit WebSocket event
    if (req.app.get('webSocketService')) {
      req.app.get('webSocketService').io.emit('new_forum_thread', newThread);
    }
    
    res.status(201).json({
      success: true,
      data: newThread
    });
  } catch (error) {
    await dbRun('ROLLBACK');
    console.error('Error creating forum thread:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create forum thread'
    });
  }
});

// Get a single thread with its posts
router.get('/:threadId', async (req, res) => {
  const { threadId } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  
  try {
    // Get thread
    const thread = await dbGet(
      `SELECT t.*, u.username as author_name, u.profile_pic as author_avatar
       FROM forum_threads t
       LEFT JOIN users u ON t.author_id = u.id
       WHERE t.id = ?`,
      [threadId]
    );
    
    if (!thread) {
      return res.status(404).json({
        success: false,
        message: 'Thread not found'
      });
    }
    
    // Get posts count
    const countResult = await dbGet(
      'SELECT COUNT(*) as count FROM forum_posts WHERE thread_id = ?',
      [threadId]
    );
    
    // Get posts with pagination
    const posts = await dbAll(
      `SELECT p.*, u.profile_pic as author_avatar
       FROM forum_posts p
       LEFT JOIN users u ON p.author_id = u.id
       WHERE p.thread_id = ?
       ORDER BY p.created_at
       LIMIT ? OFFSET ?`,
      [threadId, limit, offset]
    );
    
    // Update view count
    await dbRun(
      'UPDATE forum_threads SET view_count = view_count + 1 WHERE id = ?',
      [threadId]
    );
    
    res.json({
      success: true,
      data: {
        ...thread,
        posts,
        pagination: {
          total: countResult ? countResult.count : 0,
          page: parseInt(page),
          totalPages: Math.ceil((countResult ? countResult.count : 0) / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching forum thread:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch forum thread'
    });
  }
});

// Add a post to a thread
router.post('/:threadId/posts', async (req, res) => {
  const { threadId } = req.params;
  const { content, authorId, authorName } = req.body;
  
  if (!content || !authorId || !authorName) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: content, authorId, authorName'
    });
  }
  
  try {
    await dbRun('BEGIN TRANSACTION');
    
    // Create post
    const postId = uuidv4();
    await dbRun(
      `INSERT INTO forum_posts 
       (id, thread_id, content, author_id, author_name)
       VALUES (?, ?, ?, ?, ?)`,
      [postId, threadId, content, authorId, authorName]
    );
    
    // Update thread last activity and post count
    await dbRun(
      `UPDATE forum_threads 
       SET post_count = post_count + 1, 
           last_post_id = ?,
           last_activity = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [postId, threadId]
    );
    
    await dbRun('COMMIT');
    
    // Get the created post
    const newPost = await dbGet(
      `SELECT p.*, u.profile_pic as author_avatar
       FROM forum_posts p
       LEFT JOIN users u ON p.author_id = u.id
       WHERE p.id = ?`,
      [postId]
    );
    
    // Emit WebSocket event
    if (req.app.get('webSocketService')) {
      req.app.get('webSocketService').io.emit('new_forum_post', {
        threadId,
        post: newPost
      });
    }
    
    res.status(201).json({
      success: true,
      data: newPost
    });
  } catch (error) {
    await dbRun('ROLLBACK');
    console.error('Error adding post to thread:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add post to thread'
    });
  }
});

export default router;
