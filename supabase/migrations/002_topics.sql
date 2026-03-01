-- Phase 3: Topics for book browsing
-- Run this in the Supabase SQL Editor BEFORE implementing Phase 3.

-- 1. Topics table
CREATE TABLE topics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Many-to-many join table
CREATE TABLE book_topics (
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    PRIMARY KEY (book_id, topic_id)
);
