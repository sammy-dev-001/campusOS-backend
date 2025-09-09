const fetch = require('node-fetch');
const { API_BASE_URL } = require('../constants/Config');

// Test data
const testGroup = {
  name: 'Study buddies',
  description: 'Come to learn',
  code: 'Math 101',
  type: 'study_group',
  participants: [4]
};

async function createTestStudyGroup() {
  try {
    const response = await fetch(`${API_BASE_URL}/chat-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testGroup)
    });

    const data = await response.json();
    console.log('Create group response:', data);
  } catch (error) {
    console.error('Error creating test study group:', error);
  }
}

// createTestStudyGroup();
