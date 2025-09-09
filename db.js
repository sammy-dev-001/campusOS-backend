import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to check if a column exists in a table
async function columnExists(tableName, columnName) {
  try {
    const tableInfo = await db.all(`PRAGMA table_info(${tableName})`);
    return tableInfo.some(column => column.name === columnName);
  } catch (err) {
    console.error(`Error checking if column ${columnName} exists in ${tableName}:`, err);
    return false;
  }
}

// Helper function to safely add a column if it doesn't exist
async function addColumnIfNotExists(tableName, columnDefinition) {
  const columnName = columnDefinition.split(' ')[0];
  const exists = await columnExists(tableName, columnName);
  
  if (!exists) {
    try {
      await db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
      console.log(`Added ${columnName} column to ${tableName} table`);
    } catch (err) {
      if (err.code === 'SQLITE_ERROR' && err.message.includes('duplicate column')) {
        console.log(`Column ${columnName} already exists in ${tableName}`);
      } else {
        console.error(`Error adding column ${columnName} to ${tableName}:`, err);
        throw err;
      }
    }
  } else {
    console.log(`Column ${columnName} already exists in ${tableName}`);
  }
}

// Initialize database connection
let db;

// Database initialization
async function initializeDatabase() {
  try {
    // Create database in the project root directory
    const dbPath = path.join(__dirname, '..', 'database.db');
    
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
    
    // Enable foreign key constraints
    await db.run('PRAGMA foreign_keys = ON');
    
    console.log('Connected to SQLite database at:', dbPath);
    
    // Create tables if they don't exist
    await createTables();
    
    return db;
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

// Create necessary tables
async function createTables() {
  try {
    // Create users table with IF NOT EXISTS to prevent errors
    await db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        profile_picture TEXT,
        bio TEXT,
        department TEXT,
        courses TEXT,
        role TEXT DEFAULT 'student',
        id_picture TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT NULL
      )
    `);
    
    // Create a trigger to handle updated_at timestamp
    await db.run(`
      CREATE TRIGGER IF NOT EXISTS update_users_updated_at
      AFTER UPDATE ON users
      BEGIN
        UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);
    
    console.log('Ensured users table exists');
    
    // Check for missing columns and add them if needed
    const columns = await db.all("PRAGMA table_info(users)");
    const columnNames = columns.map(col => col.name);
    
    // Add any missing columns
    const columnsToAdd = [
      { name: 'display_name', type: 'TEXT' },
      { name: 'profile_picture', type: 'TEXT' },
      { name: 'bio', type: 'TEXT' },
      { name: 'department', type: 'TEXT' },
      { name: 'courses', type: 'TEXT' },
      { name: 'role', type: 'TEXT DEFAULT "student"' },
      { name: 'id_picture', type: 'TEXT' },
      { name: 'updated_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
    ];
    
    for (const column of columnsToAdd) {
      if (!columnNames.includes(column.name)) {
        await db.run(`ALTER TABLE users ADD COLUMN ${column.name} ${column.type}`);
        console.log(`Added ${column.name} column to users table`);
      }
    }

    // Create forum_threads table with minimal schema first
    await db.run(`
      CREATE TABLE IF NOT EXISTS forum_threads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        author_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);
    console.log('Ensured base forum_threads table exists');
    
    // Function to safely add a column if it doesn't exist
    const safeAddColumn = async (table, column, type, defaultValue = null) => {
      try {
        const columns = await db.all(`PRAGMA table_info(${table})`);
        const columnExists = columns.some(col => col.name.toLowerCase() === column.toLowerCase());
        
        if (!columnExists) {
          let sql = `ALTER TABLE ${table} ADD COLUMN ${column} ${type}`;
          // Special handling for CURRENT_TIMESTAMP default value
          if (defaultValue === 'CURRENT_TIMESTAMP') {
            // For SQLite, we'll set the default to NULL and handle the logic in the application
            sql += ' DEFAULT NULL';
          } else if (defaultValue !== null) {
            sql += ` DEFAULT ${typeof defaultValue === 'string' ? `'${defaultValue}'` : defaultValue}`;
          }
          await db.run(sql);
          console.log(`Added ${column} column to ${table} table`);
        }
      } catch (error) {
        if (!error.message.includes('duplicate column')) {
          console.error(`Error adding ${column} column:`, error);
          throw error;
        }
        // Ignore duplicate column errors
      }
    };
    
    // Add columns if they don't exist
    await safeAddColumn('forum_threads', 'category', 'TEXT', 'general');
    await safeAddColumn('forum_threads', 'updated_at', 'DATETIME', 'CURRENT_TIMESTAMP');
    await safeAddColumn('forum_threads', 'views', 'INTEGER', 0);
    await safeAddColumn('forum_threads', 'is_pinned', 'BOOLEAN', 0);
    await safeAddColumn('forum_threads', 'is_locked', 'BOOLEAN', 0);

    // Create forum_comments table
    await db.run(`
      CREATE TABLE IF NOT EXISTS forum_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        author_id INTEGER NOT NULL,
        thread_id INTEGER NOT NULL,
        parent_comment_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (author_id) REFERENCES users (id),
        FOREIGN KEY (thread_id) REFERENCES forum_threads (id) ON DELETE CASCADE,
        FOREIGN KEY (parent_comment_id) REFERENCES forum_comments (id) ON DELETE CASCADE
      )
    `);
    console.log('Ensured forum_comments table exists');
    
    // Create announcements table if it doesn't exist
    await db.run(`
      CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        author TEXT NOT NULL,
        date INTEGER NOT NULL,
        category TEXT NOT NULL,
        attachmentUrl TEXT,
        likes INTEGER DEFAULT 0,
        likedBy TEXT DEFAULT '[]',
        bookmarkedBy TEXT DEFAULT '[]'
      )
    `);
    console.log('Ensured announcements table exists');

    // Polls table
    await db.run(`
      CREATE TABLE IF NOT EXISTS polls (
        id TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        description TEXT,
        is_multiple_choice BOOLEAN DEFAULT 0,
        is_anonymous BOOLEAN DEFAULT 0,
        created_by TEXT NOT NULL,
        group_id TEXT,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    // Poll options table
    await db.run(`
      CREATE TABLE IF NOT EXISTS poll_options (
        id TEXT PRIMARY KEY,
        poll_id TEXT NOT NULL,
        text TEXT NOT NULL,
        FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
      )
    `);
    
    // Poll votes table
    await db.run(`
      CREATE TABLE IF NOT EXISTS poll_votes (
        id TEXT PRIMARY KEY,
        poll_id TEXT NOT NULL,
        option_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
        FOREIGN KEY (option_id) REFERENCES poll_options(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(poll_id, user_id, option_id) ON CONFLICT REPLACE
      )
    `);
    
    // Create tutor_applications table if it doesn't exist
    await db.run(`
      CREATE TABLE IF NOT EXISTS tutor_applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        department TEXT NOT NULL,
        course_subject TEXT NOT NULL,
        day_of_tutorial TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT NULL
      )
    `);
    
    // Create a trigger to handle updated_at timestamp for tutor_applications
    await db.run(`
      CREATE TRIGGER IF NOT EXISTS update_tutor_applications_updated_at
      AFTER UPDATE ON tutor_applications
      BEGIN
        UPDATE tutor_applications SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);
    
    console.log('Database tables verified/created');
  } catch (error) {
    console.error('Error creating tables:', error);
    throw error;
  }
}

// Get database instance
function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

// Helper function to run a query with parameters
async function dbRun(query, params = []) {
  const db = getDb();
  try {
    const result = await db.run(query, params);
    return result;
  } catch (error) {
    console.error('Database run error:', error);
    console.error('Query:', query);
    console.error('Params:', params);
    throw error;
  }
}

// Helper function to get a single row
async function dbGet(query, params = []) {
  const db = getDb();
  try {
    const row = await db.get(query, params);
    return row;
  } catch (error) {
    console.error('Database get error:', error);
    console.error('Query:', query);
    console.error('Params:', params);
    throw error;
  }
}

// Helper function to get all rows
async function dbAll(query, params = []) {
  const db = getDb();
  try {
    const rows = await db.all(query, params);
    return rows;
  } catch (error) {
    console.error('Database all error:', error);
    console.error('Query:', query);
    console.error('Params:', params);
    throw error;
  }
}

// Initialize the database when this module is imported
initializeDatabase().catch(console.error);

export { getDb, dbRun, dbGet, dbAll, initializeDatabase };
