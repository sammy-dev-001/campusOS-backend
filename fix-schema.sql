-- Add description column if it doesn't exist
ALTER TABLE chats ADD COLUMN IF NOT EXISTS description TEXT;

-- Add code column if it doesn't exist
ALTER TABLE chats ADD COLUMN IF NOT EXISTS code TEXT;

-- Add updated_at column if it doesn't exist
ALTER TABLE chats ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Verify the changes
PRAGMA table_info(chats);
