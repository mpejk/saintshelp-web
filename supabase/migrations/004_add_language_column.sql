-- Add language column to books table
-- Run in Supabase dashboard SQL editor

ALTER TABLE books ADD COLUMN language VARCHAR(5) DEFAULT 'en' NOT NULL;
CREATE INDEX books_language_idx ON books (language);
