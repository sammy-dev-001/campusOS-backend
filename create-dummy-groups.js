const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { promisify } = require('util');

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

// Promisify sqlite3 methods
const dbRun = promisify(db.run.bind(db));
const dbAll = promisify(db.all.bind(db));

// Dummy study groups data
const dummyGroups = [
  {
    name: 'Computer Science Study Group',
    description: 'Weekly study group for CS students covering algorithms and data structures',
    code: 'CS101',
    type: 'study_group',
    tutor: 'Dr. Smith',
    tutorAvatar: 'https://randomuser.me/api/portraits/men/32.jpg',
    days: ['Mon', 'Wed'],
    members: 15
  },
  {
    name: 'Mathematics Study Group',
    description: 'Study group for calculus and linear algebra',
    code: 'MATH202',
    type: 'study_group',
    tutor: 'Prof. Johnson',
    tutorAvatar: 'https://randomuser.me/api/portraits/women/44.jpg',
    days: ['Tue', 'Thu'],
    members: 12
  },
  {
    name: 'Physics Study Group',
    description: 'Study group for classical mechanics and electromagnetism',
    code: 'PHY301',
    type: 'study_group',
    tutor: 'Dr. Brown',
    tutorAvatar: 'https://randomuser.me/api/portraits/men/68.jpg',
    days: ['Wed', 'Fri'],
    members: 8
  },
  {
    name: 'Literature Club',
    description: 'Discussion group for literature enthusiasts',
    code: 'LIT101',
    type: 'study_group',
    tutor: 'Prof. Davis',
    tutorAvatar: 'https://randomuser.me/api/portraits/women/28.jpg',
    days: ['Mon', 'Thu'],
    members: 10
  },
  {
    name: 'History Study Group',
    description: 'Exploring world history and historical events',
    code: 'HIST205',
    type: 'study_group',
    tutor: 'Dr. Wilson',
    tutorAvatar: 'https://randomuser.me/api/portraits/men/75.jpg',
    days: ['Tue', 'Fri'],
    members: 7
  }
];

async function createDummyGroups() {
  try {
    console.log('Creating dummy study groups...');
    
    // Create the chats table if it doesn't exist
    await dbRun(`
      CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK (type IN ('individual', 'group', 'study_group')),
        name TEXT,
        description TEXT,
        code TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        group_image TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        tutor_name TEXT,
        tutor_avatar TEXT,
        meeting_days TEXT,
        member_count INTEGER DEFAULT 0
      )
    `);

    // Insert dummy groups
    for (const group of dummyGroups) {
      await dbRun(
        `INSERT INTO chats (
          type, name, description, code, group_image, 
          tutor_name, tutor_avatar, meeting_days, member_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          group.type,
          group.name,
          group.description,
          group.code,
          null, // group_image
          group.tutor,
          group.tutorAvatar,
          group.days.join(','),
          group.members
        ]
      );
      console.log(`Created group: ${group.name}`);
    }

    console.log('Successfully created all dummy study groups!');
  } catch (error) {
    console.error('Error creating dummy groups:', error);
  } finally {
    // Close the database connection
    db.close();
  }
}

// Run the function
createDummyGroups();
