import request from 'supertest';
import { expect } from 'chai';
import mongoose from 'mongoose';
import app from '../server.new.js';
import { connectDB, closeDB } from '../config/testDb.js';
import User from '../models/User.js';
import Poll from '../models/Poll.js';

// Test data
let testUser;
let testToken;
let testPoll;

// Helper function to create a test user and get auth token
const createTestUser = async () => {
  // Delete if exists
  await User.deleteOne({ email: 'test@example.com' });
  
  // Create test user
  const user = await User.create({
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123',
    role: 'student'
  });
  
  // Get auth token
  const res = await request(app)
    .post('/api/auth/login')
    .send({
      email: 'test@example.com',
      password: 'password123'
    });
    
  return { user, token: res.body.token };
};

describe('Polls API', () => {
  before(async () => {
    // Connect to test database
    await connectDB();
    
    // Create test user and get token
    const { user, token } = await createTestUser();
    testUser = user;
    testToken = token;
  });

  after(async () => {
    // Clean up
    await User.deleteMany({});
    await Poll.deleteMany({});
    
    // Close database connection
    await closeDB();
  });

  describe('POST /api/polls', () => {
    it('should create a new poll', async () => {
      const pollData = {
        question: 'Test Poll',
        description: 'This is a test poll',
        options: [
          { text: 'Option 1' },
          { text: 'Option 2' },
          { text: 'Option 3' }
        ],
        isMultipleChoice: false,
        isAnonymous: true
      };

      const res = await request(app)
        .post('/api/polls')
        .set('Authorization', `Bearer ${testToken}`)
        .send(pollData)
        .expect(201);

      expect(res.body.status).to.equal('success');
      expect(res.body.data.poll).to.have.property('id');
      expect(res.body.data.poll.question).to.equal(pollData.question);
      expect(res.body.data.poll.description).to.equal(pollData.description);
      expect(res.body.data.poll.options).to.have.lengthOf(3);
      expect(res.body.data.poll.createdBy).to.equal(testUser._id.toString());
      
      // Save for later tests
      testPoll = res.body.data.poll;
    });

    it('should return 400 for invalid poll data', async () => {
      const res = await request(app)
        .post('/api/polls')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          question: '', // Invalid: empty question
          options: [{ text: 'Only one option' }] // Invalid: needs at least 2 options
        })
        .expect(400);

      expect(res.body.status).to.equal('error');
    });
  });

  describe('GET /api/polls', () => {
    it('should get all polls', async () => {
      const res = await request(app)
        .get('/api/polls')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(res.body.status).to.equal('success');
      expect(res.body.data.polls).to.be.an('array');
      expect(res.body.data.polls[0].id).to.equal(testPoll.id);
    });

    it('should get a single poll by ID', async () => {
      const res = await request(app)
        .get(`/api/polls/${testPoll.id}`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(res.body.status).to.equal('success');
      expect(res.body.data.poll.id).to.equal(testPoll.id);
      expect(res.body.data.poll.question).to.equal(testPoll.question);
    });

    it('should return 404 for non-existent poll', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/polls/${nonExistentId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(404);

      expect(res.body.status).to.equal('error');
    });
  });

  describe('POST /api/polls/:pollId/vote', () => {
    it('should allow a user to vote on a poll', async () => {
      const optionId = testPoll.options[0].id;
      
      const res = await request(app)
        .post(`/api/polls/${testPoll.id}/vote`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ optionId })
        .expect(200);

      expect(res.body.status).to.equal('success');
      expect(res.body.data.poll.userVote).to.equal(optionId);
      
      // Verify the vote was recorded
      const updatedPoll = await Poll.findById(testPoll.id);
      const votedOption = updatedPoll.options.find(opt => opt.id === optionId);
      expect(votedOption.votes).to.include(testUser._id);
    });

    it('should prevent duplicate voting in single-choice polls', async () => {
      const optionId = testPoll.options[1].id;
      
      // First vote should succeed
      await request(app)
        .post(`/api/polls/${testPoll.id}/vote`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ optionId });
      
      // Second vote should fail
      const res = await request(app)
        .post(`/api/polls/${testPoll.id}/vote`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ optionId: testPoll.options[2].id })
        .expect(400);

      expect(res.body.status).to.equal('error');
      expect(res.body.message).to.include('already voted');
    });
  });

  describe('PATCH /api/polls/:pollId', () => {
    it('should update a poll', async () => {
      const updates = {
        question: 'Updated Test Poll',
        description: 'This poll has been updated',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
      };

      const res = await request(app)
        .patch(`/api/polls/${testPoll.id}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send(updates)
        .expect(200);

      expect(res.body.status).to.equal('success');
      expect(res.body.data.poll.question).to.equal(updates.question);
      expect(res.body.data.poll.description).to.equal(updates.description);
      expect(new Date(res.body.data.poll.expiresAt).getTime())
        .to.equal(new Date(updates.expiresAt).getTime());
    });

    it('should prevent unauthorized updates', async () => {
      // Create a second test user
      const { token: otherUserToken } = await createTestUser();
      
      const updates = {
        question: 'Unauthorized Update'
      };

      const res = await request(app)
        .patch(`/api/polls/${testPoll.id}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send(updates)
        .expect(403);

      expect(res.body.status).to.equal('error');
    });
  });

  describe('DELETE /api/polls/:pollId', () => {
    it('should delete a poll', async () => {
      const res = await request(app)
        .delete(`/api/polls/${testPoll.id}`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(204);

      // Verify the poll is no longer active
      const deletedPoll = await Poll.findById(testPoll.id);
      expect(deletedPoll.isActive).to.be.false;
    });

    it('should prevent unauthorized deletion', async () => {
      // Create a new poll
      const poll = await Poll.create({
        question: 'Another Test Poll',
        options: [
          { id: new mongoose.Types.ObjectId().toString(), text: 'Option 1', votes: [] },
          { id: new mongoose.Types.ObjectId().toString(), text: 'Option 2', votes: [] }
        ],
        createdBy: new mongoose.Types.ObjectId(), // Different user
        isActive: true
      });

      // Try to delete with test user (not the creator)
      const res = await request(app)
        .delete(`/api/polls/${poll._id}`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(403);

      expect(res.body.status).to.equal('error');
      
      // Clean up
      await Poll.findByIdAndDelete(poll._id);
    });
  });
});
