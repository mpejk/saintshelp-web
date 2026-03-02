import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApprovedUser } from "@/lib/authServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
    try {
        const auth = await requireApprovedUser(req);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
        if (!auth.profile.is_admin) return Response.json({ error: "Admin only" }, { status: 403 });

        const form = await req.formData();
        const entries: { title: string; file: File }[] = [];

        // Support up to 10 files: file_0, title_0, file_1, title_1, ...
        for (let i = 0; i < 10; i++) {
            const file = form.get(`file_${i}`);
            const title = (form.get(`title_${i}`) ?? "").toString().trim();
            if (!file || !(file instanceof File)) break;
            if (!title) return Response.json({ error: `Missing title for file ${i}` }, { status: 400 });
            if (file.type !== "application/pdf") return Response.json({ error: `File ${i} is not a PDF` }, { status: 400 });
            entries.push({ title, file });
        }

        if (entries.length === 0) return Response.json({ error: "No files provided" }, { status: 400 });

        const books: { id: string; title: string }[] = [];

        for (const { title, file } of entries) {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const storagePath = `${auth.user.id}/${Date.now()}_${safeName}`;

            const up = await supabaseAdmin.storage.from("books").upload(storagePath, bytes, {
                contentType: "application/pdf", upsert: false,
            });
            if (up.error) return Response.json({ error: `Storage error for "${title}": ${up.error.message}` }, { status: 500 });

            const ins = await supabaseAdmin.from("books")
                .insert({ owner_user_id: auth.user.id, title, storage_path: storagePath, indexing_status: "pending" })
                .select("id,title").single();
            if (ins.error) return Response.json({ error: ins.error.message }, { status: 500 });

            books.push(ins.data);
        }

        await supabaseAdmin.from("requests").insert({ user_id: auth.user.id, kind: "upload-batch" });

        return Response.json({ books });
    } catch (err: any) {
        console.error("Upload-batch error:", err);
        return Response.json({ error: err?.message ?? "Unexpected server error" }, { status: 500 });
    }
}
