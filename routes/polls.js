import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import path from 'path';
import { dbRun, dbGet, dbAll } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get database instance from the centralized module

// Create a new poll
router.post('/', authenticateToken, async (req, res) => {
  const { question, description, options, isMultipleChoice, isAnonymous, groupId, expiresAt } = req.body;
  const pollId = uuidv4();
  const userId = req.user.id;

  try {
    await db.run('BEGIN TRANSACTION');
    
    // Insert poll
    await db.run(
      'INSERT INTO polls (id, question, description, is_multiple_choice, is_anonymous, created_by, group_id, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [pollId, question, description, isMultipleChoice ? 1 : 0, isAnonymous ? 1 : 0, userId, groupId || null, expiresAt || null]
    );

    // Insert options
    const optionPromises = options.map(async (optionText) => {
      const optionId = uuidv4();
      await db.run(
        'INSERT INTO poll_options (id, poll_id, text) VALUES (?, ?, ?)',
        [optionId, pollId, optionText]
      );
      return { id: optionId, text: optionText, votes: 0 };
    });

    const pollOptions = await Promise.all(optionPromises);
    
    await db.run('COMMIT');
    
    res.status(201).json({
      id: pollId,
      question,
      description,
      isMultipleChoice,
      isAnonymous,
      createdBy: userId,
      groupId: groupId || null,
      expiresAt: expiresAt || null,
      options: pollOptions,
      totalVotes: 0,
      userVote: null
    });
  } catch (error) {
    await db.run('ROLLBACK');
    console.error('Error creating poll:', error);
    res.status(500).json({ error: 'Failed to create poll' });
  }
});

// Get all polls (with pagination)
router.get('/', authenticateToken, async (req, res) => {
  const { groupId, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;
  const userId = req.user.id;

  try {
    let query = `
      SELECT p.*, 
             u.name as creator_name,
             COUNT(DISTINCT v.id) as total_votes,
             (SELECT COUNT(*) FROM poll_votes WHERE poll_id = p.id AND user_id = ?) as has_voted
      FROM polls p
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN poll_votes v ON p.id = v.poll_id
    `;
    
    const params = [userId];
    
    if (groupId) {
      query += ' WHERE p.group_id = ?';
      params.push(groupId);
    }
    
    query += ' GROUP BY p.id ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const polls = await db.all(query, params);
    
    // Get options and votes for each poll
    const pollsWithOptions = await Promise.all(polls.map(async (poll) => {
      const options = await db.all(
        `SELECT o.*, COUNT(v.id) as vote_count 
         FROM poll_options o 
         LEFT JOIN poll_votes v ON o.id = v.option_id 
         WHERE o.poll_id = ? 
         GROUP BY o.id`,
        [poll.id]
      );
      
      return {
        ...poll,
        options: options.map(opt => ({
          id: opt.id,
          text: opt.text,
          votes: opt.vote_count || 0
        })),
        totalVotes: poll.total_votes,
        hasVoted: poll.has_voted > 0
      };
    }));
    
    res.json(pollsWithOptions);
  } catch (error) {
    console.error('Error fetching polls:', error);
    res.status(500).json({ error: 'Failed to fetch polls' });
  }
});

// Vote on a poll
router.post('/:pollId/vote', authenticateToken, async (req, res) => {
  const { pollId } = req.params;
  const { optionId } = req.body;
  const userId = req.user.id;

  try {
    await db.run('BEGIN TRANSACTION');
    
    // Check if user already voted and if multiple choices are allowed
    const poll = await db.get(
      'SELECT is_multiple_choice FROM polls WHERE id = ?',
      [pollId]
    );
    
    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }
    
    if (!poll.is_multiple_choice) {
      // Delete existing vote if exists
      await db.run(
        'DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?',
        [pollId, userId]
      );
    }
    
    // Check if option exists
    const option = await db.get(
      'SELECT id FROM poll_options WHERE id = ? AND poll_id = ?',
      [optionId, pollId]
    );
    
    if (!option) {
      await db.run('ROLLBACK');
      return res.status(400).json({ error: 'Invalid option' });
    }
    
    // Add new vote
    await dbRun(
      'INSERT OR IGNORE INTO poll_votes (id, poll_id, option_id, user_id) VALUES (?, ?, ?, ?)',
      [uuidv4(), pollId, optionId, userId]
    );
    
    await dbRun('COMMIT');
    
    // Get updated poll with results
    const updatedPoll = await getPollWithResults(pollId, userId);
    
    // Emit vote event
    const webSocketService = req.app.get('webSocketService');
    if (webSocketService) {
      const poll = await dbGet('SELECT group_id FROM polls WHERE id = ?', [pollId]);
      if (poll) {
        webSocketService.broadcastToGroup(poll.group_id || 'global', 'poll_updated', updatedPoll);
      }
    }
    
    res.json(updatedPoll);
  } catch (error) {
    await dbRun('ROLLBACK');
    console.error('Error voting:', error);
    res.status(500).json({ error: 'Failed to submit vote' });
  }
});

// Helper function to get poll with results
async function getPollWithResults(pollId, userId) {
  const poll = await dbGet(
    `SELECT p.*, u.name as creator_name,
            COUNT(DISTINCT v.id) as total_votes
     FROM polls p
     LEFT JOIN users u ON p.created_by = u.id
     LEFT JOIN poll_votes v ON p.id = v.poll_id
     WHERE p.id = ?
     GROUP BY p.id`,
    [pollId]
  );
  
  if (!poll) return null;
  
  const options = await dbAll(
    `SELECT o.*, COUNT(v.id) as vote_count,
            EXISTS(SELECT 1 FROM poll_votes v2 WHERE v2.option_id = o.id AND v2.user_id = ?) as user_voted
     FROM poll_options o
     LEFT JOIN poll_votes v ON o.id = v.option_id
     WHERE o.poll_id = ?
     GROUP BY o.id`,
    [userId, pollId]
  );
  
  return {
    ...poll,
    options: options.map(opt => ({
      id: opt.id,
      text: opt.text,
      votes: opt.vote_count || 0,
      userVoted: opt.user_voted === 1
    })),
    totalVotes: poll.total_votes,
    hasVoted: options.some(opt => opt.user_voted === 1)
  };
}

// Get single poll with results
router.get('/:pollId', authenticateToken, async (req, res) => {
  try {
    const poll = await getPollWithResults(req.params.pollId, req.user.id);
    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }
    res.json(poll);
  } catch (error) {
    console.error('Error fetching poll:', error);
    res.status(500).json({ error: 'Failed to fetch poll' });
  }
});

// Delete a poll (only by creator or admin)
router.delete('/:pollId', authenticateToken, async (req, res) => {
  const { pollId } = req.params;
  const userId = req.user.id;
  
  try {
    // Check if user is the creator
    const poll = await dbGet(
      'SELECT created_by FROM polls WHERE id = ?',
      [pollId]
    );
    
    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }
    
    // TODO: Add admin check here
    if (poll.created_by !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this poll' });
    }
    
    // Delete will cascade to options and votes due to foreign key constraints
    await dbRun('DELETE FROM polls WHERE id = ?', [pollId]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting poll:', error);
    res.status(500).json({ error: 'Failed to delete poll' });
  }
});

// Get poll analytics
router.get('/:pollId/analytics', authenticateToken, async (req, res) => {
  const { pollId } = req.params;
  
  try {
    // Get basic poll info
    const poll = await dbGet(
      'SELECT p.*, u.name as creator_name FROM polls p JOIN users u ON p.created_by = u.id WHERE p.id = ?',
      [pollId]
    );
    
    if (!poll) {
      return res.status(404).json({ error: 'Poll not found' });
    }
    
    // Get options with vote counts
    const options = await dbAll(
      `SELECT o.*, COUNT(v.id) as vote_count,
              (COUNT(v.id) * 100.0 / (SELECT COUNT(DISTINCT v2.id) FROM poll_votes v2 WHERE v2.poll_id = ?)) as percentage
       FROM poll_options o
       LEFT JOIN poll_votes v ON o.id = v.option_id
       WHERE o.poll_id = ?
       GROUP BY o.id
       ORDER BY vote_count DESC`,
      [pollId, pollId]
    );
    
    // Get total votes
    const totalVotes = await db.get(
      'SELECT COUNT(DISTINCT user_id) as count FROM poll_votes WHERE poll_id = ?',
      [pollId]
    );
    
    // Get voting timeline (votes per day)
    const timeline = await db.all(
      `SELECT DATE(created_at) as date, COUNT(DISTINCT user_id) as count
       FROM poll_votes
       WHERE poll_id = ?
       GROUP BY DATE(created_at)
       ORDER BY date`,
      [pollId]
    );
    
    // Get voter demographics (example: by user role)
    const demographics = await db.all(
      `SELECT u.role, COUNT(DISTINCT v.user_id) as count
       FROM poll_votes v
       JOIN users u ON v.user_id = u.id
       WHERE v.poll_id = ?
       GROUP BY u.role`,
      [pollId]
    );
    
    res.json({
      poll: {
        ...poll,
        options: options.map(opt => ({
          ...opt,
          votes: opt.vote_count || 0,
          percentage: opt.percentage || 0
        }))
      },
      totalVotes: totalVotes.count || 0,
      timeline,
      demographics
    });
  } catch (error) {
    console.error('Error fetching poll analytics:', error);
    res.status(500).json({ error: 'Failed to fetch poll analytics' });
  }
});

export default router;
