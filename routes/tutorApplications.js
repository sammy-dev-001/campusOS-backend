import express from 'express';
import { dbRun, dbAll } from '../db.js';

const router = express.Router();

// Submit a new tutor application
router.post('/', async (req, res) => {
  try {
    const { name, department, course_subject, day_of_tutorial, email, phone } = req.body;
    
    // Basic validation
    if (!name || !department || !course_subject || !day_of_tutorial || !email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const sql = `
      INSERT INTO tutor_applications 
      (name, department, course_subject, day_of_tutorial, email, phone, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `;
    
    const params = [name, department, course_subject, day_of_tutorial, email, phone || null];
    
    const result = await dbRun(sql, params);
    
    res.status(201).json({
      id: result.lastID,
      message: 'Tutor application submitted successfully',
      status: 'pending',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error submitting tutor application:', error);
    res.status(500).json({ error: 'Failed to submit tutor application' });
  }
});

// Get all tutor applications (with 15-second delay for new ones)
router.get('/', async (req, res) => {
  try {
    const sql = `
      SELECT *, 
             (strftime('%s', 'now') - strftime('%s', created_at)) as seconds_old
      FROM tutor_applications
      WHERE (strftime('%s', 'now') - strftime('%s', created_at)) > 15
      ORDER BY created_at DESC
    `;
    
    const applications = await dbAll(sql);
    
    // Convert seconds_old to number and remove it from the response
    const processed = applications.map(app => ({
      ...app,
      seconds_old: parseInt(app.seconds_old, 10)
    }));
    
    res.json(processed);
    
  } catch (error) {
    console.error('Error fetching tutor applications:', error);
    res.status(500).json({ error: 'Failed to fetch tutor applications' });
  }
});

export default router;
