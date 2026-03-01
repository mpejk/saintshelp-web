-- Phase 1: pgvector search foundation
-- Run this in the Supabase SQL Editor BEFORE starting code implementation.

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Book chunks table (stores embedded text chunks)
CREATE TABLE book_chunks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    embedding vector(1024) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON book_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON book_chunks (book_id);

-- 3. Add indexing columns to books table
ALTER TABLE books ADD COLUMN indexing_status TEXT DEFAULT 'pending'
    CHECK (indexing_status IN ('pending', 'chunking', 'embedding', 'ready', 'failed'));
ALTER TABLE books ADD COLUMN indexing_error TEXT;
ALTER TABLE books ADD COLUMN chunk_count INTEGER DEFAULT 0;

-- 4. Search function: single query replaces N OpenAI API calls
CREATE OR REPLACE FUNCTION search_chunks(
    query_embedding vector(1024),
    book_ids UUID[],
    match_count INTEGER DEFAULT 24,
    similarity_threshold FLOAT DEFAULT 0.4
)
RETURNS TABLE (chunk_id UUID, book_id UUID, chunk_text TEXT, similarity FLOAT)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT bc.id, bc.book_id, bc.chunk_text,
           1 - (bc.embedding <=> query_embedding) AS similarity
    FROM book_chunks bc
    WHERE bc.book_id = ANY(book_ids)
    ORDER BY bc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
