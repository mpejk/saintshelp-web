// Batch upload and index all PDFs from a source directory
// Run: node scripts/batch-upload.mjs [optional-dir]
// Default source: ~/Downloads/saintshelp-books/

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, dirname, basename, join } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

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
    console.error("Missing env vars in .env.local");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const ADMIN_USER_ID = "3c4a518b-d151-42f1-a9a0-d9ba6a01d2dc";
const MAX_STORAGE_SIZE = 50 * 1024 * 1024; // 50MB — skip storage for files larger than this

// ---------- Helpers ----------

function parseTitleFromFilename(filename) {
    // "Book Title - Author.pdf" → "Book Title – Author"
    const noExt = filename.replace(/\.pdf$/i, "");
    return noExt.replace(/ - /g, " – ");
}

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
        results.push(...json.data.map((d) => d.embedding));
        console.log(`    Embedded ${Math.min(i + BATCH, texts.length)}/${texts.length}`);
    }
    return results;
}

async function extractText(pdfBuffer) {
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

function qualityCheck(text) {
    if (text.length < 500) return { ok: false, reason: "Too short (< 500 chars)" };

    // Non-printable ratio
    const nonPrintable = (text.match(/[^\x20-\x7E\n\r\t\u00A0-\uFFFF]/g) ?? []).length;
    const ratio = nonPrintable / text.length;
    if (ratio > 0.15) return { ok: false, reason: `Non-printable ratio too high (${(ratio * 100).toFixed(1)}%)` };

    // Avg words per line
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    const totalWords = lines.reduce((sum, l) => sum + l.trim().split(/\s+/).length, 0);
    const avgWords = totalWords / Math.max(lines.length, 1);
    if (avgWords < 2) return { ok: false, reason: `Avg words per line too low (${avgWords.toFixed(1)})` };

    return { ok: true, reason: "" };
}

// ---------- Main ----------

async function main() {
    const sourceDir = process.argv[2] ?? join(homedir(), "Downloads", "saintshelp-books");
    console.log(`Source directory: ${sourceDir}`);

    const files = readdirSync(sourceDir)
        .filter((f) => f.toLowerCase().endsWith(".pdf"))
        .sort();

    console.log(`Found ${files.length} PDF files\n`);

    // Fetch existing books to check for duplicates
    const { data: existingBooks } = await supabase
        .from("books")
        .select("id,title");
    const existingTitles = new Set((existingBooks ?? []).map((b) => b.title.toLowerCase()));

    const results = []; // { file, status, chunks, reason }
    const seenTitles = new Set(); // track within this batch too

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const title = parseTitleFromFilename(file);
        const filePath = join(sourceDir, file);
        const fileSize = statSync(filePath).size;

        console.log(`\n[${i + 1}/${files.length}] ${title}`);
        console.log(`  File: ${file} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`);

        // Duplicate check
        if (existingTitles.has(title.toLowerCase()) || seenTitles.has(title.toLowerCase())) {
            console.log("  SKIP: already exists in DB or batch");
            results.push({ file, status: "SKIP", chunks: 0, reason: "Duplicate" });
            continue;
        }
        seenTitles.add(title.toLowerCase());

        try {
            // Read PDF
            const buffer = readFileSync(filePath);

            // Extract text
            console.log("  Extracting text...");
            const text = await extractText(buffer);
            console.log(`  Text: ${text.length} chars`);

            // Quality check
            const quality = qualityCheck(text);
            if (!quality.ok) {
                console.log(`  FAIL: ${quality.reason}`);
                results.push({ file, status: "FAIL", chunks: 0, reason: quality.reason });
                continue;
            }

            // Upload to Supabase Storage (skip for large files)
            let storagePath = null;
            if (fileSize <= MAX_STORAGE_SIZE) {
                const safeName = file.replace(/[^a-zA-Z0-9._-]/g, "_");
                storagePath = `batch/${Date.now()}_${safeName}`;
                console.log("  Uploading to storage...");
                const { error: upErr } = await supabase.storage.from("books").upload(storagePath, buffer, {
                    contentType: "application/pdf",
                    upsert: false,
                });
                if (upErr) {
                    console.log(`  Storage upload failed: ${upErr.message} (will continue without storage)`);
                    storagePath = null;
                }
            } else {
                console.log(`  Skipping storage upload (${(fileSize / 1024 / 1024).toFixed(0)} MB > 50 MB limit)`);
            }

            // Insert books row
            const insertData = {
                title,
                storage_path: storagePath ?? `batch/no-storage-${Date.now()}`,
                indexing_status: "pending",
                language: "en",
                owner_user_id: ADMIN_USER_ID,
            };
            const { data: bookRow, error: insErr } = await supabase
                .from("books")
                .insert(insertData)
                .select("id")
                .single();
            if (insErr) throw new Error(`Insert book failed: ${insErr.message}`);

            const bookId = bookRow.id;

            // Chunk
            const chunks = chunkText(text);
            console.log(`  Chunks: ${chunks.length}`);

            await supabase.from("books").update({ indexing_status: "embedding", chunk_count: chunks.length }).eq("id", bookId);

            // Embed
            console.log("  Embedding...");
            const embeddings = await embedTexts(chunks);

            // Insert chunks with embeddings in batches
            console.log("  Inserting chunks...");
            const rows = chunks.map((chunk, idx) => ({
                book_id: bookId,
                chunk_index: idx,
                chunk_text: chunk,
                embedding: JSON.stringify(embeddings[idx]),
            }));

            for (let j = 0; j < rows.length; j += 25) {
                const batch = rows.slice(j, j + 25);
                const { error: chunkErr } = await supabase.from("book_chunks").insert(batch);
                if (chunkErr) throw new Error(`Insert chunks failed: ${chunkErr.message}`);
                console.log(`    Inserted ${Math.min(j + 25, rows.length)}/${rows.length}`);
            }

            await supabase.from("books").update({ indexing_status: "ready" }).eq("id", bookId);
            console.log(`  PASS: ${chunks.length} chunks indexed`);
            results.push({ file, status: "PASS", chunks: chunks.length, reason: "" });
        } catch (err) {
            console.error(`  FAIL: ${err.message}`);
            results.push({ file, status: "FAIL", chunks: 0, reason: err.message });
        }
    }

    // Print summary table
    console.log("\n\n========== SUMMARY ==========\n");
    console.log("Status  | Chunks | File");
    console.log("--------|--------|--------------------------------------------");
    for (const r of results) {
        const status = r.status.padEnd(6);
        const chunks = String(r.chunks).padStart(6);
        const detail = r.reason ? ` (${r.reason})` : "";
        console.log(`${status} | ${chunks} | ${r.file}${detail}`);
    }

    const pass = results.filter((r) => r.status === "PASS").length;
    const skip = results.filter((r) => r.status === "SKIP").length;
    const fail = results.filter((r) => r.status === "FAIL").length;
    const totalChunks = results.reduce((s, r) => s + r.chunks, 0);
    console.log(`\nTotal: ${pass} PASS, ${skip} SKIP, ${fail} FAIL — ${totalChunks} chunks indexed`);
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
