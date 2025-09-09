import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  try {
    // Open the database connection
    const db = await open({
      filename: path.join(__dirname, 'database.sqlite'),
      driver: sqlite3.Database
    });

    console.log('Connected to the database');

    // Read the migration file
    const migrationSql = await readFile(
      path.join(__dirname, 'migrations', '001_add_study_group_fields.sql'),
      'utf-8'
    );

    // Split the SQL into individual statements
    const statements = migrationSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // Execute each statement in a transaction
    await db.exec('BEGIN TRANSACTION');
    
    try {
      for (const statement of statements) {
        console.log('Executing:', statement.substring(0, 100) + (statement.length > 100 ? '...' : ''));
        await db.exec(statement);
      }
      await db.exec('COMMIT');
      console.log('Migration completed successfully');
    } catch (error) {
      await db.exec('ROLLBACK');
      console.error('Error during migration, rolled back:', error);
      throw error;
    }

    // Verify the table structure
    console.log('\nCurrent chats table structure:');
    const tableInfo = await db.all('PRAGMA table_info(chats)');
    console.table(tableInfo);

    // Close the database connection
    await db.close();
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
