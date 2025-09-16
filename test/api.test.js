import request from 'supertest';
import { expect } from 'chai';
import mongoose from 'mongoose';
import app from '../server.js';
import { connectDB } from '../config/db.js';

// Test data
const testUser = {
  email: 'test@example.com',
  password: 'Test@123',
  name: 'Test User',
  role: 'student'
};

let authToken = '';
let userId = '';

describe('CampusOS API Tests', () => {
  before(async () => {
    // Connect to test database
    await connectDB();
    
    // Clear test data
    await mongoose.connection.db.dropDatabase();
    
    // Register a test user
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);
      
    userId = res.body.user._id;
    authToken = res.body.token;
  });

  after(async () => {
    // Close the database connection
    await mongoose.connection.close();
  });

  describe('Authentication', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });
      
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('token');
      expect(res.body.user).to.have.property('email', testUser.email);
    });
  });

  describe('Announcements', () => {
    let announcementId;

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
      announcementId = res.body._id;
    });

    it('should get all announcements', async () => {
      const res = await request(app)
        .get('/api/announcements')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.status).to.equal(200);
      expect(res.body).to.be.an('array');
      expect(res.body[0]).to.have.property('title');
    });
  });

  describe('Tutors', () => {
    let tutorId;

    it('should create a new tutor profile', async () => {
      const tutorData = {
        department: 'Computer Science',
        bio: 'Experienced tutor in programming',
        qualifications: [{
          degree: 'MSc Computer Science',
          institution: 'Test University',
          year: 2020
        }]
      };

      const res = await request(app)
        .post('/api/tutors')
        .set('Authorization', `Bearer ${authToken}`)
        .send(tutorData);
      
      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('department', tutorData.department);
      tutorId = res.body._id;
    });

    it('should get all tutors', async () => {
      const res = await request(app)
        .get('/api/tutors')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.status).to.equal(200);
      expect(res.body).to.be.an('array');
    });
  });

  describe('Timetable', () => {
    let timetableId;

    it('should create a new timetable entry', async () => {
      const timetableData = {
        course: new mongoose.Types.ObjectId(),
        tutor: new mongoose.Types.ObjectId(),
        dayOfWeek: 'monday',
        startTime: '09:00',
        endTime: '11:00',
        location: 'Room 101',
        startDate: new Date(),
        isOnline: false
      };

      const res = await request(app)
        .post('/api/timetables')
        .set('Authorization', `Bearer ${authToken}`)
        .send(timetableData);
      
      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('dayOfWeek', 'monday');
      timetableId = res.body._id;
    });

    it('should get all timetable entries', async () => {
      const res = await request(app)
        .get('/api/timetables')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.status).to.equal(200);
      expect(res.body).to.be.an('array');
    });
  });
});
