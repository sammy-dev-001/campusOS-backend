import request from 'supertest';
import { expect } from 'chai';
import mongoose from 'mongoose';
import app from '../server.new.js';
import { connectTestDB, clearTestDB, closeTestDB } from './testHelper.js';
import User from '../models/User.js';
import Tutor from '../models/Tutor.js';

// Test data
const adminUser = {
  name: 'Admin User',
  email: 'admin@example.com',
  password: 'Admin@123',
  role: 'admin'
};

const testTutor = {
  department: 'Computer Science',
  bio: 'Experienced tutor in programming',
  qualifications: [{
    degree: 'MSc Computer Science',
    institution: 'Test University',
    year: 2020
  }],
  availability: [{
    day: 'monday',
    startTime: '09:00',
    endTime: '17:00'
  }]
};

let adminToken;
let adminUserId;
let tutorId;

describe('Tutor API Tests', () => {
  before(async () => {
    // Connect to test database
    await connectTestDB();
    
    // Clear test database
    await clearTestDB();
    
    // Register an admin user
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send(adminUser);
      
    adminToken = registerRes.body.token;
    adminUserId = registerRes.body.user._id;
  });

  after(async () => {
    // Clean up and close connection
    await clearTestDB();
    await closeTestDB();
  });

  describe('POST /api/tutors/profile/me', () => {
    it('should create a new tutor profile', async () => {
      // First, create a regular user
      const userRes = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Tutor User',
          email: 'tutor@example.com',
          password: 'Tutor@123'
        });
      
      const token = userRes.body.token;
      
      // Create tutor profile
      const res = await request(app)
        .post('/api/tutors/profile/me')
        .set('Authorization', `Bearer ${token}`)
        .send(testTutor);
      
      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('department', testTutor.department);
      expect(res.body.qualifications).to.have.lengthOf(1);
      expect(res.body.availability).to.have.lengthOf(1);
      
      // Save tutor ID for later tests
      tutorId = res.body._id;
      
      // Verify user role was updated to tutor
      const user = await User.findById(userRes.body.user._id);
      expect(user.role).to.equal('tutor');
    });
  });

  describe('GET /api/tutors', () => {
    before(async () => {
      // Create multiple tutor profiles
      await Tutor.create([
        {
          user: adminUserId,
          department: 'Mathematics',
          bio: 'Math tutor',
          isAvailable: true
        },
        {
          user: new mongoose.Types.ObjectId(),
          department: 'Physics',
          bio: 'Physics tutor',
          isAvailable: true
        }
      ]);
    });

    it('should get all tutors', async () => {
      const res = await request(app)
        .get('/api/tutors')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).to.equal(200);
      expect(res.body).to.be.an('array');
      expect(res.body.length).to.be.at.least(2);
    });

    it('should filter tutors by department', async () => {
      const res = await request(app)
        .get('/api/tutors?department=Mathematics')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).to.equal(200);
      expect(res.body.every(t => t.department === 'Mathematics')).to.be.true;
    });
  });

  describe('GET /api/tutors/:id', () => {
    it('should get tutor by ID', async () => {
      const res = await request(app)
        .get(`/api/tutors/${tutorId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('department', testTutor.department);
      expect(res.body).to.have.property('_id', tutorId.toString());
    });

    it('should return 404 for non-existent tutor', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/tutors/${nonExistentId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).to.equal(404);
    });
  });

  describe('PUT /api/tutors/profile/me', () => {
    it('should update tutor profile', async () => {
      const updates = {
        bio: 'Updated bio with more experience',
        qualifications: [
          ...testTutor.qualifications,
          {
            degree: 'BSc Computer Science',
            institution: 'Another University',
            year: 2018
          }
        ]
      };

      // Create a tutor to update
      const userRes = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Update Tutor',
          email: 'update@example.com',
          password: 'Update@123'
        });
      
      const token = userRes.body.token;
      
      // First create the tutor profile
      await request(app)
        .post('/api/tutors/profile/me')
        .set('Authorization', `Bearer ${token}`)
        .send(testTutor);
      
      // Then update it
      const res = await request(app)
        .put('/api/tutors/profile/me')
        .set('Authorization', `Bearer ${token}`)
        .send(updates);
      
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('bio', updates.bio);
      expect(res.body.qualifications).to.have.lengthOf(2);
    });
  });

  describe('DELETE /api/tutors/profile', () => {
    it('should delete tutor profile', async () => {
      // Create a tutor to delete
      const userRes = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Delete Tutor',
          email: 'delete@example.com',
          password: 'Delete@123'
        });
      
      const token = userRes.body.token;
      const userId = userRes.body.user._id;
      
      // Create tutor profile
      await request(app)
        .post('/api/tutors/profile/me')
        .set('Authorization', `Bearer ${token}`)
        .send(testTutor);
      
      // Delete the profile
      const res = await request(app)
        .delete('/api/tutors/profile')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('message', 'Tutor profile removed');
      
      // Verify it's actually deleted
      const tutor = await Tutor.findOne({ user: userId });
      expect(tutor).to.be.null;
      
      // Verify user role was updated
      const user = await User.findById(userId);
      expect(user.role).to.equal('student');
    });
  });
});
