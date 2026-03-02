-- Fix: Replace broken IVFFlat index with HNSW
-- IVFFlat was created before data existed, so clusters are empty/broken.
-- HNSW doesn't require data at creation time and has better recall.

-- Drop the broken IVFFlat index
DROP INDEX IF EXISTS book_chunks_embedding_idx;

-- Create HNSW index (works correctly regardless of when data is inserted)
CREATE INDEX book_chunks_embedding_idx ON book_chunks USING hnsw (embedding vector_cosine_ops);

-- Fix search_chunks: add the similarity_threshold WHERE clause (was missing)
CREATE OR REPLACE FUNCTION search_chunks(
    query_embedding vector(1024),
    book_ids UUID[],
    match_count INTEGER DEFAULT 24,
    similarity_threshold FLOAT DEFAULT 0.2
)
RETURNS TABLE (chunk_id UUID, book_id UUID, chunk_text TEXT, similarity FLOAT)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT bc.id, bc.book_id, bc.chunk_text,
           1 - (bc.embedding <=> query_embedding) AS similarity
    FROM book_chunks bc
    WHERE bc.book_id = ANY(book_ids)
      AND 1 - (bc.embedding <=> query_embedding) >= similarity_threshold
    ORDER BY bc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
