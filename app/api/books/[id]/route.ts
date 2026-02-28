import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApprovedUser } from "@/lib/authServer";
import { openai } from "@/lib/openaiServer";

export const runtime = "nodejs";

export async function DELETE(
    req: Request,
    ctx: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await requireApprovedUser(req);
        if (!auth.ok) {
            return Response.json({ error: auth.error }, { status: auth.status });
        }

        if (!auth.profile.is_admin) {
            return Response.json({ error: "Admin only" }, { status: 403 });
        }

        const { id: bookId } = await ctx.params;

        const { data: book, error } = await supabaseAdmin
            .from("books")
            .select("*")
            .eq("id", bookId)
            .single();

        if (error || !book) {
            return Response.json({ error: "Book not found" }, { status: 404 });
        }

        // Delete from OpenAI (best-effort)
        if (book.openai_file_id) {
            try { await openai.files.delete(book.openai_file_id); } catch { }
        }
        if (book.openai_vector_store_id) {
            try { await openai.vectorStores.delete(book.openai_vector_store_id); } catch { }
        }

        // Delete from Supabase Storage (best-effort)
        if (book.storage_path) {
            try {
                await supabaseAdmin.storage.from("books").remove([book.storage_path]);
            } catch { }
        }

        // Delete DB row
        const del = await supabaseAdmin.from("books").delete().eq("id", bookId);
        if (del.error) {
            return Response.json({ error: del.error.message }, { status: 500 });
        }

        return Response.json({ success: true });
    } catch (err: any) {
        console.error("Delete error:", err);
        return Response.json(
            { error: err?.message ?? "Unexpected server error" },
            { status: 500 }
        );
    }
}