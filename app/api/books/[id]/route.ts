import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApprovedUser } from "@/lib/authServer";

export const runtime = "nodejs";

export async function DELETE(
    req: Request,
    ctx: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await requireApprovedUser(req);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
        if (!auth.profile.is_admin) return Response.json({ error: "Admin only" }, { status: 403 });

        const { id: bookId } = await ctx.params;

        const { data: book, error } = await supabaseAdmin.from("books").select("*").eq("id", bookId).single();
        if (error || !book) return Response.json({ error: "Book not found" }, { status: 404 });

        // Delete chunks
        await supabaseAdmin.from("book_chunks").delete().eq("book_id", bookId);

        // Delete topic associations
        await supabaseAdmin.from("book_topics").delete().eq("book_id", bookId);

        // Delete from Supabase Storage (best-effort)
        if (book.storage_path) {
            try { await supabaseAdmin.storage.from("books").remove([book.storage_path]); } catch {}
        }

        // Delete DB row
        const del = await supabaseAdmin.from("books").delete().eq("id", bookId);
        if (del.error) return Response.json({ error: del.error.message }, { status: 500 });

        return Response.json({ success: true });
    } catch (err: any) {
        console.error("Delete error:", err);
        return Response.json({ error: err?.message ?? "Unexpected server error" }, { status: 500 });
    }
}
