import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', '..', 'database.db');

console.log('Checking database file at:', dbPath);

// Check if database file exists
if (fs.existsSync(dbPath)) {
  const stats = fs.statSync(dbPath);
  console.log('Database file exists!');
  console.log('Size:', stats.size, 'bytes');
  console.log('Created:', stats.birthtime);
  console.log('Last modified:', stats.mtime);
} else {
  console.log('Database file does not exist at:', dbPath);
  console.log('Current working directory:', process.cwd());
  console.log('Directory contents:', fs.readdirSync(path.dirname(dbPath)));
}
