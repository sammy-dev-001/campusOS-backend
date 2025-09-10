import mongoose from 'mongoose';
import request from 'supertest';
import app from '../server.js';
import User from '../models/User.js';
import Event from '../models/Event.js';
import jwt from 'jsonwebtoken';

let authToken;
let testUser;
let testEvent;

// Test data
const testUserData = {
  username: 'testuser',
  email: 'test@example.com',
  password: 'Test@1234',
  displayName: 'Test User'
};

const testEventData = {
  title: 'Test Event',
  description: 'This is a test event',
  startDate: new Date(Date.now() + 86400000), // Tomorrow
  endDate: new Date(Date.now() + 172800000), // 2 days from now
  location: 'Test Location',
  category: 'Workshop',
  isFeatured: true
};

// Helper function to generate JWT token for testing
const generateAuthToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

// Setup test data before each test
beforeEach(async () => {
  // Create a test user
  testUser = await User.create(testUserData);
  
  // Generate auth token
  authToken = generateAuthToken(testUser._id);
  
  // Create a test event
  testEvent = await Event.create({
    ...testEventData,
    createdBy: testUser._id
  });
});

// Clean up after each test
afterEach(async () => {
  await User.deleteMany({});
  await Event.deleteMany({});
});

describe('Event Management', () => {
  // Test event creation
  describe('POST /api/events', () => {
    it('should create a new event', async () => {
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send(testEventData);
      
      expect(res.statusCode).toEqual(201);
      expect(res.body.status).toEqual('success');
      expect(res.body.data.event).toHaveProperty('_id');
      expect(res.body.data.event.title).toBe(testEventData.title);
      
      // Save the created event for later tests
      testEvent = res.body.data.event;
    });

    it('should return 401 if not authenticated', async () => {
      const res = await request(app)
        .post('/api/events')
        .send(testEventData);
      
      expect(res.statusCode).toEqual(401);
    });
  });

  // Test getting events
  describe('GET /api/events', () => {
    it('should get all events', async () => {
      const res = await request(app).get('/api/events');
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(Array.isArray(res.body.data.events)).toBeTruthy();
      expect(res.body.data.events.length).toBeGreaterThan(0);
    });

    it('should filter events by category', async () => {
      const res = await request(app)
        .get('/api/events')
        .query({ category: 'Workshop' });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.events.every(e => e.category === 'Workshop')).toBeTruthy();
    });
  });

  // Test getting a single event
  describe('GET /api/events/:id', () => {
    it('should get a single event by ID', async () => {
      const res = await request(app).get(`/api/events/${testEvent._id}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.data.event._id).toBe(testEvent._id);
    });

    it('should return 404 for non-existent event', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app).get(`/api/events/${nonExistentId}`);
      
      expect(res.statusCode).toEqual(404);
    });
  });

  // Test updating an event
  describe('PUT /api/events/:id', () => {
    it('should update an event', async () => {
      const updates = { title: 'Updated Test Event' };
      const res = await request(app)
        .put(`/api/events/${testEvent._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updates);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.data.event.title).toBe(updates.title);
    });

    it('should not allow non-owners to update', async () => {
      // Create another user
      const otherUser = await User.create({
        username: 'otheruser',
        email: 'other@example.com',
        password: 'Other@1234',
        displayName: 'Other User'
      });
      
      // Get token for other user
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'other@example.com',
          password: 'Other@1234'
        });
      
      const otherUserToken = loginRes.body.token;
      
      // Try to update with other user's token
      const updates = { title: 'Unauthorized Update' };
      const res = await request(app)
        .put(`/api/events/${testEvent._id}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send(updates);
      
      expect(res.statusCode).toEqual(404); // Should not find the event for this user
    });
  });

  // Test RSVP functionality
  describe('POST /api/events/:id/rsvp', () => {
    it('should allow a user to RSVP to an event', async () => {
      const res = await request(app)
        .post(`/api/events/${testEvent._id}/rsvp`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'going' });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.data.attendee.status).toBe('going');
    });

    it('should update RSVP status if already exists', async () => {
      const res = await request(app)
        .post(`/api/events/${testEvent._id}/rsvp`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'not_going' });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.attendee.status).toBe('not_going');
    });
  });

  // Test getting event attendees
  describe('GET /api/events/:id/attendees', () => {
    it('should get event attendees', async () => {
      const res = await request(app).get(`/api/events/${testEvent._id}/attendees`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(Array.isArray(res.body.data.attendees)).toBeTruthy();
      expect(res.body.data.attendees.length).toBe(1);
      expect(res.body.data.attendees[0].user._id).toBe(testUser._id.toString());
    });

    it('should filter attendees by status', async () => {
      // First, set up a test user with 'interested' status
      const anotherUser = await User.create({
        username: 'attendeeuser',
        email: 'attendee@example.com',
        password: 'Attendee@1234',
        displayName: 'Attendee User'
      });
      
      // Get token for the new user
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'attendee@example.com',
          password: 'Attendee@1234'
        });
      
      const userToken = loginRes.body.token;
      
      // RSVP as 'interested'
      await request(app)
        .post(`/api/events/${testEvent._id}/rsvp`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ status: 'interested' });
      
      // Now test the filter
      const res = await request(app)
        .get(`/api/events/${testEvent._id}/attendees`)
        .query({ status: 'interested' });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.attendees.length).toBe(1);
      expect(res.body.data.attendees[0].status).toBe('interested');
    });
  });

  // Test deleting an event
  describe('DELETE /api/events/:id', () => {
    it('should delete an event', async () => {
      const res = await request(app)
        .delete(`/api/events/${testEvent._id}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.statusCode).toEqual(204);
      
      // Verify it's deleted
      const verifyRes = await request(app).get(`/api/events/${testEvent._id}`);
      expect(verifyRes.statusCode).toEqual(404);
    });

    it('should not allow non-owners to delete', async () => {
      // Create a new event first
      const eventRes = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send(testEventData);
      
      const newEventId = eventRes.body.data.event._id;
      
      // Create another user
      const otherUser = await User.create({
        username: 'anotheruser',
        email: 'another@example.com',
        password: 'Another@1234',
        displayName: 'Another User'
      });
      
      // Get token for other user
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'another@example.com',
          password: 'Another@1234'
        });
      
      const otherUserToken = loginRes.body.token;
      
      // Try to delete with other user's token
      const res = await request(app)
        .delete(`/api/events/${newEventId}`)
        .set('Authorization', `Bearer ${otherUserToken}`);
      
      expect(res.statusCode).toEqual(404); // Should not find the event for this user
    });
  });
});
