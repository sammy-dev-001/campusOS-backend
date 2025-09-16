import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.test
const envPath = path.resolve(__dirname, '../.env.test');
dotenv.config({ path: envPath });

// Set default test environment variables
process.env.NODE_ENV = 'test';

// If no test database URI is set, use a local test database
if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI = 'mongodb://localhost:27017/campusos_test';
}

// Set a test JWT secret if not set
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-secret-key';
}

// Set a test JWT expiration
if (!process.env.JWT_EXPIRES_IN) {
  process.env.JWT_EXPIRES_IN = '7d';
}
