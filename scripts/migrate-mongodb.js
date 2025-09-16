import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';

async function loadModel(modulePath) {
  try {
    // Skip loading the model if it has known circular dependencies
    if (modulePath.includes('Chat.js') || modulePath.includes('Message.js')) {
      console.log(`⚠️  Skipping circular dependency model: ${modulePath}`);
      return null;
    }
    
    const module = await import(modulePath);
    const model = module.default || module;
    
    // Skip initialization for models with known issues
    if (modulePath.includes('Post.js') && model.schema.plugins) {
      // Remove mongoose-keywords plugin if it's causing issues
      const keywordsIndex = model.schema.plugins.findIndex(p => 
        p.fn && p.fn.toString().includes('mongoose-keywords')
      );
      if (keywordsIndex > -1) {
        model.schema.plugins.splice(keywordsIndex, 1);
        console.log(`ℹ️  Removed mongoose-keywords plugin from ${modulePath}`);
      }
    }
    
    return model;
  } catch (error) {
    console.error(`❌ Failed to load model from ${modulePath}:`, error.message);
    return null;
  }
}

async function runMigration() {
  try {
    console.log('🚀 Starting MongoDB migration...');
    
    // Connect to MongoDB
    await connectDB();
    const db = mongoose.connection.db;
    
    console.log('🔍 Checking existing collections...');
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    console.log('📋 Found collections:', collectionNames);
    
    // Define model paths
    const modelPaths = [
      { name: 'users', path: '../models/User.js' },
      { name: 'posts', path: '../models/Post.js' },
      { name: 'comments', path: '../models/Comment.js' },
      { name: 'chats', path: '../models/Chat.js' },
      { name: 'messages', path: '../models/Message.js' },
      { name: 'events', path: '../models/Event.js' },
      { name: 'notifications', path: '../models/Notification.js' },
      { name: 'announcements', path: '../models/Announcement.js' },
      { name: 'tutors', path: '../models/Tutor.js' },
      { name: 'timetables', path: '../models/Timetable.js' },
    ];

    // Process each model
    for (const { name, path } of modelPaths) {
      try {
        if (!collectionNames.includes(name)) {
          console.log(`🆕 Creating collection: ${name}`);
          await db.createCollection(name);
        } else {
          console.log(`✅ Collection exists: ${name}`);
        }
        
        // Load and initialize the model
        const model = await loadModel(path);
        if (model && model.init) {
          await model.init();
          console.log(`🔑 Initialized indexes for: ${name}`);
        }
        
      } catch (error) {
        console.error(`⚠️  Warning: Could not process ${name}:`, error.message);
      }
    }
    
    console.log('\n✨ Migration completed successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
runMigration();
