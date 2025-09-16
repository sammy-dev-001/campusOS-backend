import request from 'supertest';
import { expect } from 'chai';
import mongoose from 'mongoose';
import app from '../server.new.js';
import { connectTestDB, clearTestDB, closeTestDB } from './testHelper.js';
import User from '../models/User.js';
import Announcement from '../models/Announcement.js';

// Test data
const testUser = {
  name: 'Test User',
  email: 'test@example.com',
  password: 'Test@123',
  role: 'admin'
};

let authToken;
let userId;

describe('Announcement API Tests', () => {
  before(async () => {
    // Connect to test database
    await connectTestDB();
    
    // Clear test database
    await clearTestDB();
    
    // Register a test user
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send(testUser);
      
    authToken = registerRes.body.token;
    userId = registerRes.body.user._id;
  });

  after(async () => {
    // Clean up and close connection
    await clearTestDB();
    await closeTestDB();
  });

  describe('POST /api/announcements', () => {
    it('should create a new announcement', async () => {
      const announcement = {
        title: 'Important Update',
        content: 'This is an important announcement',
        targetAudience: ['students'],
        isPinned: true
      };

      const res = await request(app)
        .post('/api/announcements')
        .set('Authorization', `Bearer ${authToken}`)
        .send(announcement);
      
      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('title', announcement.title);
      expect(res.body).to.have.property('content', announcement.content);
      expect(res.body).to.have.property('isPinned', true);
      expect(res.body).to.have.property('author', userId);
    });

    it('should return 400 if required fields are missing', async () => {
      const res = await request(app)
        .post('/api/announcements')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Incomplete Announcement' });
      
      expect(res.status).to.equal(400);
      expect(res.body).to.have.property('message');
    });
  });

  describe('GET /api/announcements', () => {
    before(async () => {
      // Create test announcements
      await Announcement.create([
        {
          title: 'Announcement 1',
          content: 'Content 1',
          author: userId,
          isPinned: true
        },
        {
          title: 'Announcement 2',
          content: 'Content 2',
          author: userId,
          isPinned: false
        }
      ]);
    });

    it('should get all announcements', async () => {
      const res = await request(app)
        .get('/api/announcements')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('announcements');
      expect(res.body.announcements).to.be.an('array');
      expect(res.body.announcements.length).to.be.at.least(2);
    });

    it('should filter pinned announcements', async () => {
      const res = await request(app)
        .get('/api/announcements?pinned=true')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.status).to.equal(200);
      expect(res.body.announcements.every(a => a.isPinned === true)).to.be.true;
    });
  });

  describe('GET /api/announcements/:id', () => {
    let announcementId;

    before(async () => {
      // Create a test announcement
      const announcement = await Announcement.create({
        title: 'Test Announcement',
        content: 'Test Content',
        author: userId
      });
      
      announcementId = announcement._id;
    });

    it('should get announcement by ID', async () => {
      const res = await request(app)
        .get(`/api/announcements/${announcementId}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('title', 'Test Announcement');
      expect(res.body).to.have.property('content', 'Test Content');
    });

    it('should return 404 for non-existent announcement', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/announcements/${nonExistentId}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.status).to.equal(404);
    });
  });

  describe('PUT /api/announcements/:id', () => {
    let announcementId;

    beforeEach(async () => {
      // Create a test announcement before each test
      const announcement = await Announcement.create({
        title: 'Original Title',
        content: 'Original Content',
        author: userId
      });
      
      announcementId = announcement._id;
    });

    it('should update an announcement', async () => {
      const updates = {
        title: 'Updated Title',
        content: 'Updated Content',
        isPinned: true
      };

      const res = await request(app)
        .put(`/api/announcements/${announcementId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updates);
      
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('title', updates.title);
      expect(res.body).to.have.property('content', updates.content);
      expect(res.body).to.have.property('isPinned', true);
    });

    it('should return 403 if user is not the author', async () => {
      // Create another user
      const anotherUser = await User.create({
        name: 'Another User',
        email: 'another@example.com',
        password: 'Test@123'
      });
      
      // Get token for another user
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'another@example.com',
          password: 'Test@123'
        });
      
      const anotherToken = loginRes.body.token;
      
      // Try to update the announcement with another user
      const res = await request(app)
        .put(`/api/announcements/${announcementId}`)
        .set('Authorization', `Bearer ${anotherToken}`)
        .send({ title: 'Unauthorized Update' });
      
      expect(res.status).to.equal(403);
    });
  });

  describe('DELETE /api/announcements/:id', () => {
    let announcementId;

    beforeEach(async () => {
      // Create a test announcement before each test
      const announcement = await Announcement.create({
        title: 'To be deleted',
        content: 'This will be deleted',
        author: userId
      });
      
      announcementId = announcement._id;
    });

    it('should delete an announcement', async () => {
      const res = await request(app)
        .delete(`/api/announcements/${announcementId}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('message', 'Announcement removed');
      
      // Verify it's actually deleted
      const announcement = await Announcement.findById(announcementId);
      expect(announcement).to.be.null;
    });
  });
});
