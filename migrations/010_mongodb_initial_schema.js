import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { User, Post, Comment, Chat, Message, Event, Notification } from '../models/index.js';

/**
 * MongoDB Migration Script
 * 
 * This script initializes the MongoDB collections and indexes based on the Mongoose models.
 * It's idempotent, so it can be run multiple times safely.
 */

export async function up() {
  try {
    console.log('Starting MongoDB schema migration...');
    
    // Connect to MongoDB
    await connectDB();
    const db = mongoose.connection.db;
    
    // Create collections if they don't exist
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    // Create collections based on models
    const models = [
      { name: 'users', model: User },
      { name: 'posts', model: Post },
      { name: 'comments', model: Comment },
      { name: 'chats', model: Chat },
      { name: 'messages', model: Message },
      { name: 'events', model: Event },
      { name: 'notifications', model: Notification }
    ];
    
    for (const { name, model } of models) {
      if (!collectionNames.includes(name)) {
        console.log(`Creating collection: ${name}`);
        await db.createCollection(name);
      }
      
      // Create indexes for the model
      console.log(`Ensuring indexes for: ${name}`);
      await model.init();
    }
    
    // Create text indexes for search functionality
    await db.collection('posts').createIndex(
      { content: 'text', 'hashtags': 'text', 'mentions.user.username': 'text' },
      {
        name: 'post_text_search',
        weights: {
          content: 10,
          'hashtags': 5,
          'mentions.user.username': 1
        }
      }
    );
    
    await db.collection('comments').createIndex(
      { content: 'text', 'hashtags': 'text', 'mentions.user.username': 'text' },
      {
        name: 'comment_text_search',
        weights: {
          content: 10,
          'hashtags': 5,
          'mentions.user.username': 1
        }
      }
    );
    
    // Create compound indexes for common queries
    await db.collection('posts').createIndex({ author: 1, createdAt: -1 });
    await db.collection('posts').createIndex({ 'location.coordinates': '2dsphere' });
    await db.collection('posts').createIndex({ status: 1, scheduledAt: 1 });
    
    await db.collection('comments').createIndex({ post: 1, createdAt: -1 });
    await db.collection('comments').createIndex({ parentComment: 1, createdAt: 1 });
    
    console.log('MongoDB schema migration completed successfully');
    return true;
  } catch (error) {
    console.error('Error during MongoDB schema migration:', error);
    throw error;
  }
}

export async function down() {
  // This is a destructive operation - only use in development
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Cannot drop collections in production');
  }
  
  try {
    console.log('Dropping MongoDB collections...');
    
    // Connect to MongoDB
    await connectDB();
    const db = mongoose.connection.db;
    
    // Drop collections (in reverse order to respect foreign key constraints)
    const collections = [
      'notifications',
      'messages',
      'chats',
      'comments',
      'posts',
      'events',
      'users'
    ];
    
    for (const collection of collections) {
      console.log(`Dropping collection: ${collection}`);
      await db.dropCollection(collection).catch(() => {
        console.log(`Collection ${collection} does not exist, skipping`);
      });
    }
    
    console.log('Successfully dropped all collections');
    return true;
  } catch (error) {
    console.error('Error dropping MongoDB collections:', error);
    throw error;
  }
}

// Run the migration if this file is executed directly
if (process.argv[1] === import.meta.filename) {
  const command = process.argv[2] || 'up';
  
  (async () => {
    try {
      if (command === 'up') {
        await up();
      } else if (command === 'down') {
        await down();
      } else {
        console.log('Usage: node mongodb_initial_schema.js [up|down]');
        process.exit(1);
      }
      
      process.exit(0);
    } catch (error) {
      console.error('Migration failed:', error);
      process.exit(1);
    }
  })();
}
