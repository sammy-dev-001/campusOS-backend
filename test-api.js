import request from 'supertest';
import { expect } from 'chai';
import mongoose from 'mongoose';
import app from './server.js';
import { connectDB } from './config/db.js';

// Set test environment
process.env.NODE_ENV = 'test';

// Test data
const testUser = {
  email: 'test@example.com',
  password: 'Test@123',
  name: 'Test User',
  role: 'student'
};

let authToken = '';
let userId = '';

// Helper function to run tests
async function runTests() {
  try {
    console.log('🚀 Starting API tests...');
    
    // Connect to test database
    console.log('🔌 Connecting to MongoDB...');
    await connectDB();
    
    // Clear test data
    console.log('🧹 Cleaning test database...');
    await mongoose.connection.db.dropDatabase();
    
    console.log('\n🔵 Running Authentication Tests...');
    await testAuthentication();
    
    console.log('\n🟢 All tests completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

async function testAuthentication() {
  console.log('  Testing user registration...');
  const registerRes = await request(app)
    .post('/api/auth/register')
    .send(testUser);
    
  expect(registerRes.status).to.equal(201);
  expect(registerRes.body).to.have.property('token');
  expect(registerRes.body.user).to.have.property('email', testUser.email);
  
  authToken = registerRes.body.token;
  userId = registerRes.body.user._id;
  
  console.log('  ✅ User registered successfully');
  
  console.log('  Testing user login...');
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: testUser.email,
      password: testUser.password
    });
    
  expect(loginRes.status).to.equal(200);
  expect(loginRes.body).to.have.property('token');
  console.log('  ✅ User logged in successfully');
  
  // Test protected route
  const profileRes = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${authToken}`);
    
  expect(profileRes.status).to.equal(200);
  expect(profileRes.body).to.have.property('email', testUser.email);
  console.log('  ✅ Protected route accessed successfully');
}

// Run the tests
runTests();
