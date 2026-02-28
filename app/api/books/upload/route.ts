import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApprovedUser } from "@/lib/authServer";
import { openai } from "@/lib/openaiServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
    try {
        const auth = await requireApprovedUser(req);
        if (!auth.ok) {
            return Response.json({ error: auth.error }, { status: auth.status });
        }

        if (!auth.profile.is_admin) {
            return Response.json({ error: "Admin only" }, { status: 403 });
        }

        const form = await req.formData();
        const file = form.get("file");
        const title = (form.get("title") ?? "").toString().trim();

        if (!file || !(file instanceof File)) {
            return Response.json({ error: "Missing file" }, { status: 400 });
        }

        if (!title) {
            return Response.json({ error: "Missing title" }, { status: 400 });
        }

        if (file.type !== "application/pdf") {
            return Response.json({ error: "Only PDF supported" }, { status: 400 });
        }

        // Store in Supabase Storage
        const bytes = new Uint8Array(await file.arrayBuffer());
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `${auth.user.id}/${Date.now()}_${safeName}`;

        const up = await supabaseAdmin.storage
            .from("books")
            .upload(storagePath, bytes, {
                contentType: "application/pdf",
                upsert: false,
            });

        if (up.error) {
            return Response.json({ error: up.error.message }, { status: 500 });
        }

        // Insert DB record
        const ins = await supabaseAdmin
            .from("books")
            .insert({
                owner_user_id: auth.user.id,
                title,
                storage_path: storagePath,
            })
            .select("id,title,storage_path,created_at")
            .single();

        if (ins.error) {
            return Response.json({ error: ins.error.message }, { status: 500 });
        }

        // 🔹 OpenAI indexing
        const vectorStore = await openai.vectorStores.create({
            name: `SaintsHelp - ${title}`,
        });

        const openaiFile = await openai.files.create({
            file, // Use the File from formData directly
            purpose: "assistants",
        });

        await openai.vectorStores.files.createAndPoll(vectorStore.id, {
            file_id: openaiFile.id,
        });

        const upd = await supabaseAdmin
            .from("books")
            .update({
                openai_vector_store_id: vectorStore.id,
                openai_file_id: openaiFile.id,
            })
            .eq("id", ins.data.id);

        if (upd.error) {
            return Response.json(
                { error: "Failed to save OpenAI IDs: " + upd.error.message },
                { status: 500 }
            );
        }

        await supabaseAdmin
            .from("requests")
            .insert({ user_id: auth.user.id, kind: "upload" });

        return Response.json({ book: ins.data });
    } catch (err: any) {
        console.error("Upload error:", err);
        return Response.json(
            { error: err?.message ?? "Unexpected server error" },
            { status: 500 }
        );
    }
}