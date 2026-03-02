// One-time script to re-index all existing books through Voyage AI + pgvector
// Run: node scripts/reindex-all.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");
const envLines = readFileSync(envPath, "utf8").split("\n");
const env = {};
for (const line of envLines) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const VOYAGE_KEY = env.VOYAGE_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !VOYAGE_KEY) {
    console.error("Missing env vars");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function embedTexts(texts) {
    const BATCH = 128;
    const results = [];
    for (let i = 0; i < texts.length; i += BATCH) {
        const batch = texts.slice(i, i + BATCH);
        const res = await fetch("https://api.voyageai.com/v1/embeddings", {
            method: "POST",
            headers: { Authorization: `Bearer ${VOYAGE_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "voyage-3", input: batch, input_type: "document" }),
        });
        if (!res.ok) throw new Error(`Voyage error: ${await res.text()}`);
        const json = await res.json();
        results.push(...json.data.map(d => d.embedding));
        console.log(`  Embedded ${Math.min(i + BATCH, texts.length)}/${texts.length} chunks`);
    }
    return results;
}

async function extractText(pdfBuffer) {
    // Dynamic import of pdf-parse
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
}

function chunkText(text, size = 800, overlap = 200) {
    const paragraphs = text.split(/\n\s*\n/);
    const chunks = [];
    let current = "";
    for (const para of paragraphs) {
        const trimmed = para.trim();
        if (!trimmed) continue;
        if (current.length + trimmed.length + 1 > size && current.length > 0) {
            chunks.push(current.trim());
            const overlapText = current.slice(-overlap).trim();
            current = overlapText ? overlapText + "\n\n" + trimmed : trimmed;
        } else {
            current = current ? current + "\n\n" + trimmed : trimmed;
        }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
}

async function reindexBook(book) {
    console.log(`\n=== Re-indexing: ${book.title} (${book.id}) ===`);

    // Delete existing chunks
    await supabase.from("book_chunks").delete().eq("book_id", book.id);
    await supabase.from("books").update({ indexing_status: "chunking", indexing_error: null }).eq("id", book.id);

    // Download PDF
    console.log("  Downloading PDF...");
    const { data: fileData, error: dlErr } = await supabase.storage.from("books").download(book.storage_path);
    if (dlErr || !fileData) {
        console.error("  Failed to download:", dlErr?.message);
        await supabase.from("books").update({ indexing_status: "failed", indexing_error: "Download failed" }).eq("id", book.id);
        return;
    }

    // Extract text
    console.log("  Extracting text...");
    const buffer = Buffer.from(await fileData.arrayBuffer());
    const text = await extractText(buffer);
    console.log(`  Text length: ${text.length} chars`);

    // Chunk
    const chunks = chunkText(text);
    console.log(`  Chunks: ${chunks.length}`);

    // Embed first, then insert with embeddings
    await supabase.from("books").update({ indexing_status: "embedding", chunk_count: chunks.length }).eq("id", book.id);

    console.log("  Embedding chunks...");
    const embeddings = await embedTexts(chunks);

    // Insert chunks with embeddings
    console.log("  Inserting chunks with embeddings...");
    const rows = chunks.map((chunk, i) => ({
        book_id: book.id,
        chunk_index: i,
        chunk_text: chunk,
        embedding: JSON.stringify(embeddings[i]),
    }));
    for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error } = await supabase.from("book_chunks").insert(batch);
        if (error) {
            console.error("  Insert error:", error.message);
            await supabase.from("books").update({ indexing_status: "failed", indexing_error: error.message }).eq("id", book.id);
            return;
        }
        console.log(`  Inserted ${Math.min(i + 100, rows.length)}/${rows.length} chunks`);
    }

    await supabase.from("books").update({ indexing_status: "ready" }).eq("id", book.id);
    console.log(`  Done! ${chunks.length} chunks indexed.`);
}

async function main() {
    const { data: books, error } = await supabase
        .from("books")
        .select("id,title,storage_path,indexing_status")
        .order("created_at", { ascending: true });

    if (error) { console.error("Failed to fetch books:", error.message); return; }

    console.log(`Found ${books.length} books to re-index`);

    for (const book of books) {
        await reindexBook(book);
    }

    console.log("\n=== All done! ===");
}

main().catch(console.error);
