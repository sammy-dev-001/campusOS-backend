import express from 'express';
import multer from 'multer';
import { dbRun, dbAll, dbGet } from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Get all study groups with optional filters
router.get('/', async (req, res) => {
  try {
    const { 
      subject, 
      level, 
      day, 
      time, 
      location, 
      page = 1, 
      limit = 20 
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    // Build query
    let query = 'FROM study_groups';
    const conditions = [];
    const params = [];
    
    if (subject) {
      conditions.push('subject LIKE ?');
      params.push(`%${subject}%`);
    }
    
    if (level) {
      conditions.push('level = ?');
      params.push(level);
    }
    
    if (day) {
      conditions.push('meeting_days LIKE ?');
      params.push(`%${day}%`);
    }
    
    if (time) {
      conditions.push('meeting_time = ?');
      params.push(time);
    }
    
    if (location) {
      conditions.push('(location LIKE ? OR is_online = 1)');
      params.push(`%${location}%`);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    // Get total count
    const countResult = await dbGet(`SELECT COUNT(*) as count ${query}`, params);
    const total = countResult ? countResult.count : 0;
    
    // Get study groups with member count
    const studyGroups = await dbAll(
      `SELECT 
         g.*, 
         (SELECT COUNT(*) FROM study_group_members WHERE group_id = g.id) as member_count,
         u.username as creator_name,
         u.profile_pic as creator_avatar
       ${query}
       LEFT JOIN users u ON g.creator_id = u.id
       ORDER BY g.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    
    res.json({
      success: true,
      data: studyGroups,
      pagination: {
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching study groups:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch study groups'
    });
  }
});

// Create a new study group
router.post('/', multer().single('image'), async (req, res) => {
  const {
    name,
    description,
    subject,
    level,
    maxMembers,
    meetingDays,
    meetingTime,
    location,
    isOnline,
    creatorId,
    creatorName,
    tags
  } = req.body;
  
  const file = req.file;
  
  // Validate required fields
  const requiredFields = [
    'name', 'description', 'subject', 'level', 'maxMembers', 
    'meetingDays', 'meetingTime', 'creatorId', 'creatorName'
  ];
  
  const missingFields = requiredFields.filter(field => !req.body[field]);
  
  if (missingFields.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Missing required fields: ${missingFields.join(', ')}`
    });
  }
  
  try {
    // Handle image upload if present
    let imageUrl = null;
    if (file) {
      // In a real app, upload to Cloudinary
      // For now, just store the file info
      imageUrl = `/uploads/study-groups/${Date.now()}-${file.originalname}`;
      // TODO: Implement actual file upload to Cloudinary
    }
    
    // Create study group
    const groupId = uuidv4();
    await dbRun(
      `INSERT INTO study_groups (
        id, name, description, subject, level, max_members, 
        meeting_days, meeting_time, location, is_online, 
        image_url, creator_id, creator_name, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        groupId,
        name,
        description,
        subject,
        level,
        maxMembers,
        meetingDays,
        meetingTime,
        location,
        isOnline ? 1 : 0,
        imageUrl,
        creatorId,
        creatorName,
        tags ? JSON.stringify(tags) : null
      ]
    );
    
    // Add creator as the first member
    await dbRun(
      `INSERT INTO study_group_members (group_id, user_id, user_name, role)
       VALUES (?, ?, ?, 'creator')`,
      [groupId, creatorId, creatorName]
    );
    
    // Get the created group with member count
    const newGroup = await dbGet(
      `SELECT 
         g.*, 
         (SELECT COUNT(*) FROM study_group_members WHERE group_id = g.id) as member_count,
         u.profile_pic as creator_avatar
       FROM study_groups g
       LEFT JOIN users u ON g.creator_id = u.id
       WHERE g.id = ?`,
      [groupId]
    );
    
    // Emit WebSocket event
    if (req.app.get('webSocketService')) {
      req.app.get('webSocketService').io.emit('new_study_group', newGroup);
    }
    
    res.status(201).json({
      success: true,
      data: newGroup
    });
  } catch (error) {
    console.error('Error creating study group:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create study group'
    });
  }
});

// Get a single study group with members
router.get('/:groupId', async (req, res) => {
  const { groupId } = req.params;
  
  try {
    // Get study group
    const group = await dbGet(
      `SELECT 
         g.*, 
         (SELECT COUNT(*) FROM study_group_members WHERE group_id = g.id) as member_count,
         u.profile_pic as creator_avatar
       FROM study_groups g
       LEFT JOIN users u ON g.creator_id = u.id
       WHERE g.id = ?`,
      [groupId]
    );
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Study group not found'
      });
    }
    
    // Get members
    const members = await dbAll(
      `SELECT 
         m.*, 
         u.profile_pic as avatar,
         u.email as user_email
       FROM study_group_members m
       LEFT JOIN users u ON m.user_id = u.id
       WHERE m.group_id = ?
       ORDER BY 
         CASE m.role 
           WHEN 'creator' THEN 1
           WHEN 'admin' THEN 2
           ELSE 3 
         END,
         m.joined_at`,
      [groupId]
    );
    
    // Get upcoming sessions
    const sessions = await dbAll(
      `SELECT * FROM study_sessions 
       WHERE group_id = ? AND session_time > datetime('now')
       ORDER BY session_time
       LIMIT 5`,
      [groupId]
    );
    
    res.json({
      success: true,
      data: {
        ...group,
        members,
        upcomingSessions: sessions
      }
    });
  } catch (error) {
    console.error('Error fetching study group:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch study group'
    });
  }
});

// Join a study group
router.post('/:groupId/join', async (req, res) => {
  const { groupId } = req.params;
  const { userId, userName } = req.body;
  
  if (!userId || !userName) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: userId, userName'
    });
  }
  
  try {
    // Check if group exists and has space
    const group = await dbGet(
      `SELECT 
         g.*, 
         (SELECT COUNT(*) FROM study_group_members WHERE group_id = g.id) as member_count
       FROM study_groups g
       WHERE g.id = ?`,
      [groupId]
    );
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Study group not found'
      });
    }
    
    if (group.member_count >= group.max_members) {
      return res.status(400).json({
        success: false,
        message: 'This study group is full'
      });
    }
    
    // Check if user is already a member
    const existingMember = await dbGet(
      'SELECT * FROM study_group_members WHERE group_id = ? AND user_id = ?',
      [groupId, userId]
    );
    
    if (existingMember) {
      return res.status(400).json({
        success: false,
        message: 'You are already a member of this group'
      });
    }
    
    // Add user to group
    await dbRun(
      `INSERT INTO study_group_members (group_id, user_id, user_name, role)
       VALUES (?, ?, ?, 'member')`,
      [groupId, userId, userName]
    );
    
    // Update member count
    await dbRun(
      'UPDATE study_groups SET member_count = member_count + 1 WHERE id = ?',
      [groupId]
    );
    
    // Get the new member info
    const newMember = await dbGet(
      `SELECT 
         m.*, 
         u.profile_pic as avatar,
         u.email as user_email
       FROM study_group_members m
       LEFT JOIN users u ON m.user_id = u.id
       WHERE m.group_id = ? AND m.user_id = ?`,
      [groupId, userId]
    );
    
    // Emit WebSocket event
    if (req.app.get('webSocketService')) {
      req.app.get('webSocketService').io.emit('study_group_member_joined', {
        groupId,
        member: newMember
      });
    }
    
    res.status(201).json({
      success: true,
      data: newMember
    });
  } catch (error) {
    console.error('Error joining study group:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to join study group'
    });
  }
});

// Create a study session
router.post('/:groupId/sessions', async (req, res) => {
  const { groupId } = req.params;
  const { 
    title, 
    description, 
    sessionTime, 
    duration, 
    location, 
    isOnline, 
    meetingLink,
    createdBy
  } = req.body;
  
  if (!title || !sessionTime || !createdBy) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: title, sessionTime, createdBy'
    });
  }
  
  try {
    // Check if group exists and user is a member
    const isMember = await dbGet(
      'SELECT 1 FROM study_group_members WHERE group_id = ? AND user_id = ?',
      [groupId, createdBy]
    );
    
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: 'You must be a member of the group to create a session'
      });
    }
    
    // Create session
    const sessionId = uuidv4();
    await dbRun(
      `INSERT INTO study_sessions (
        id, group_id, title, description, session_time, 
        duration, location, is_online, meeting_link, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        groupId,
        title,
        description || null,
        sessionTime,
        duration || 60, // Default to 60 minutes
        location || null,
        isOnline ? 1 : 0,
        meetingLink || null,
        createdBy
      ]
    );
    
    // Get the created session
    const newSession = await dbGet(
      `SELECT s.*, u.username as creator_name, u.profile_pic as creator_avatar
       FROM study_sessions s
       LEFT JOIN users u ON s.created_by = u.id
       WHERE s.id = ?`,
      [sessionId]
    );
    
    // Emit WebSocket event
    if (req.app.get('webSocketService')) {
      req.app.get('webSocketService').io.emit('new_study_session', {
        groupId,
        session: newSession
      });
    }
    
    res.status(201).json({
      success: true,
      data: newSession
    });
  } catch (error) {
    console.error('Error creating study session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create study session'
    });
  }
});

export default router;
