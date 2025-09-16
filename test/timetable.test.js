import request from 'supertest';
import { expect } from 'chai';
import mongoose from 'mongoose';
import app from '../server.new.js';
import { connectTestDB, clearTestDB, closeTestDB } from './testHelper.js';
import User from '../models/User.js';
import Course from '../models/Course.js';
import Tutor from '../models/Tutor.js';
import Timetable from '../models/Timetable.js';

// Test data
const adminUser = {
  name: 'Admin User',
  email: 'admin@timetable.test',
  password: 'Admin@123',
  role: 'admin'
};

let adminToken;
let courseId;
let tutorId;
let timetableId;

// Helper function to create a test course
const createTestCourse = async () => {
  const course = new Course({
    name: 'Test Course',
    code: 'CS101',
    description: 'Test Course Description',
    credits: 3,
    department: 'Computer Science'
  });
  return await course.save();
};

// Helper function to create a test tutor
const createTestTutor = async (userId) => {
  const tutor = new Tutor({
    user: userId,
    department: 'Computer Science',
    bio: 'Test Tutor Bio'
  });
  return await tutor.save();
};

describe('Timetable API Tests', () => {
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
    
    // Create test data
    const course = await createTestCourse();
    courseId = course._id;
    
    const tutor = await createTestTutor(registerRes.body.user._id);
    tutorId = tutor._id;
  });

  after(async () => {
    // Clean up and close connection
    await clearTestDB();
    await closeTestDB();
  });

  describe('POST /api/timetables', () => {
    it('should create a new timetable entry', async () => {
      const timetableData = {
        course: courseId,
        tutor: tutorId,
        dayOfWeek: 'monday',
        startTime: '09:00',
        endTime: '11:00',
        location: 'Room 101',
        isOnline: false,
        recurring: true,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      };

      const res = await request(app)
        .post('/api/timetables')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(timetableData);
      
      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('dayOfWeek', 'monday');
      expect(res.body).to.have.property('startTime', '09:00');
      expect(res.body).to.have.property('endTime', '11:00');
      
      // Save the ID for later tests
      timetableId = res.body._id;
    });

    it('should return 400 for invalid timetable data', async () => {
      const invalidData = {
        // Missing required fields
        dayOfWeek: 'invalid-day',
        startTime: 'invalid-time'
      };

      const res = await request(app)
        .post('/api/timetables')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidData);
      
      expect(res.status).to.equal(400);
    });
  });

  describe('GET /api/timetables', () => {
    before(async () => {
      // Create multiple timetable entries for testing
      await Timetable.create([
        {
          course: courseId,
          tutor: tutorId,
          dayOfWeek: 'tuesday',
          startTime: '13:00',
          endTime: '15:00',
          location: 'Room 102',
          isOnline: false,
          recurring: true,
          startDate: new Date(),
          createdBy: new mongoose.Types.ObjectId()
        },
        {
          course: courseId,
          tutor: tutorId,
          dayOfWeek: 'wednesday',
          startTime: '10:00',
          endTime: '12:00',
          location: 'Online',
          isOnline: true,
          meetingLink: 'https://meet.example.com/class',
          recurring: true,
          startDate: new Date(),
          createdBy: new mongoose.Types.ObjectId()
        }
      ]);
    });

    it('should get all timetable entries', async () => {
      const res = await request(app)
        .get('/api/timetables')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).to.equal(200);
      expect(res.body).to.be.an('array');
      expect(res.body.length).to.be.at.least(1);
    });

    it('should filter timetable entries by day of week', async () => {
      const res = await request(app)
        .get('/api/timetables?dayOfWeek=tuesday')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).to.equal(200);
      expect(res.body.every(entry => entry.dayOfWeek === 'tuesday')).to.be.true;
    });

    it('should filter online/offline entries', async () => {
      const res = await request(app)
        .get('/api/timetables?isOnline=true')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).to.equal(200);
      expect(res.body.every(entry => entry.isOnline === true)).to.be.true;
    });
  });

  describe('GET /api/timetables/:id', () => {
    it('should get a timetable entry by ID', async () => {
      const res = await request(app)
        .get(`/api/timetables/${timetableId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('_id', timetableId.toString());
      expect(res.body).to.have.property('dayOfWeek', 'monday');
    });

    it('should return 404 for non-existent timetable entry', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/timetables/${nonExistentId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).to.equal(404);
    });
  });

  describe('PUT /api/timetables/:id', () => {
    it('should update a timetable entry', async () => {
      const updates = {
        dayOfWeek: 'thursday',
        startTime: '14:00',
        endTime: '16:00',
        location: 'Room 203',
        isOnline: false
      };

      const res = await request(app)
        .put(`/api/timetables/${timetableId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updates);
      
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('dayOfWeek', 'thursday');
      expect(res.body).to.have.property('startTime', '14:00');
      expect(res.body).to.have.property('endTime', '16:00');
      expect(res.body).to.have.property('location', 'Room 203');
    });
  });

  describe('GET /api/timetables/me', () => {
    it('should get timetable for current user', async () => {
      // Create a student user
      const studentRes = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test Student',
          email: 'student@timetable.test',
          password: 'Student@123',
          role: 'student'
        });
      
      const studentToken = studentRes.body.token;
      const studentId = studentRes.body.user._id;
      
      // Enroll student in course
      await User.findByIdAndUpdate(studentId, {
        $addToSet: { enrolledCourses: courseId }
      });
      
      // Get timetable for student
      const res = await request(app)
        .get('/api/timetables/me')
        .set('Authorization', `Bearer ${studentToken}`);
      
      expect(res.status).to.equal(200);
      expect(res.body).to.be.an('array');
      // Should include the timetable entry we created earlier
      expect(res.body.some(entry => entry._id === timetableId)).to.be.true;
    });
  });

  describe('DELETE /api/timetables/:id', () => {
    it('should delete a timetable entry', async () => {
      // First create a timetable entry to delete
      const timetableData = {
        course: courseId,
        tutor: tutorId,
        dayOfWeek: 'friday',
        startTime: '10:00',
        endTime: '12:00',
        location: 'Room 301',
        isOnline: false,
        recurring: false,
        startDate: new Date()
      };

      const createRes = await request(app)
        .post('/api/timetables')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(timetableData);
      
      const entryId = createRes.body._id;
      
      // Now delete it
      const res = await request(app)
        .delete(`/api/timetables/${entryId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('message', 'Timetable entry removed');
      
      // Verify it's actually deleted
      const entry = await Timetable.findById(entryId);
      expect(entry).to.be.null;
    });
  });
});
