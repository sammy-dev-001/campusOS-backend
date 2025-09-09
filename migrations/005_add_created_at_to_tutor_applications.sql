-- Add created_at column if it doesn't exist
ALTER TABLE tutor_applications 
ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Update any existing records with current timestamp
UPDATE tutor_applications 
SET created_at = datetime('now') 
WHERE created_at IS NULL;
