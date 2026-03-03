import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApprovedUser } from "@/lib/authServer";
import { extractTextFromPdf, chunkText } from "@/lib/chunker";
import { embedTexts } from "@/lib/voyage";

export const runtime = "nodejs";

export async function POST(req: Request) {
    try {
        const auth = await requireApprovedUser(req);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
        if (!auth.profile.is_admin) return Response.json({ error: "Admin only" }, { status: 403 });

        const form = await req.formData();
        const file = form.get("file");
        const title = (form.get("title") ?? "").toString().trim();
        const language = (form.get("language") ?? "en").toString().trim();

        if (!file || !(file instanceof File)) return Response.json({ error: "Missing file" }, { status: 400 });
        if (!title) return Response.json({ error: "Missing title" }, { status: 400 });
        if (file.type !== "application/pdf") return Response.json({ error: "Only PDF supported" }, { status: 400 });

        const bytes = new Uint8Array(await file.arrayBuffer());
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `${auth.user.id}/${Date.now()}_${safeName}`;

        const up = await supabaseAdmin.storage.from("books").upload(storagePath, bytes, {
            contentType: "application/pdf", upsert: false,
        });
        if (up.error) return Response.json({ error: up.error.message }, { status: 500 });

        const ins = await supabaseAdmin.from("books")
            .insert({ owner_user_id: auth.user.id, title, storage_path: storagePath, indexing_status: "pending", language })
            .select("id,title,storage_path,created_at,language").single();
        if (ins.error) return Response.json({ error: ins.error.message }, { status: 500 });

        const bookId = ins.data.id;

        try {
            // Extract text from PDF
            await supabaseAdmin.from("books").update({ indexing_status: "chunking" }).eq("id", bookId);
            const text = await extractTextFromPdf(Buffer.from(bytes));
            const chunks = chunkText(text);

            // Embed chunks via Voyage AI
            await supabaseAdmin.from("books").update({ indexing_status: "embedding" }).eq("id", bookId);
            const embeddings = await embedTexts(chunks);

            // Insert chunks with embeddings
            const rows = chunks.map((chunk, i) => ({
                book_id: bookId,
                chunk_index: i,
                chunk_text: chunk,
                embedding: JSON.stringify(embeddings[i]),
            }));

            // Insert in batches of 100
            for (let i = 0; i < rows.length; i += 100) {
                const batch = rows.slice(i, i + 100);
                const { error: chunkErr } = await supabaseAdmin.from("book_chunks").insert(batch);
                if (chunkErr) throw new Error(`Failed to insert chunks: ${chunkErr.message}`);
            }

            await supabaseAdmin.from("books").update({
                indexing_status: "ready",
                chunk_count: chunks.length,
            }).eq("id", bookId);
        } catch (indexErr: any) {
            console.error("Indexing error:", indexErr);
            await supabaseAdmin.from("books").update({
                indexing_status: "failed",
                indexing_error: indexErr?.message ?? "Unknown indexing error",
            }).eq("id", bookId);
            return Response.json({ error: "Upload succeeded but indexing failed: " + (indexErr?.message ?? "Unknown") }, { status: 500 });
        }

        await supabaseAdmin.from("requests").insert({ user_id: auth.user.id, kind: "upload" });

        return Response.json({ book: ins.data });
    } catch (err: any) {
        console.error("Upload error:", err);
        return Response.json({ error: err?.message ?? "Unexpected server error" }, { status: 500 });
    }
}
