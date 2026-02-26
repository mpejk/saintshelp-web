"use client";

export default function AdminPage() {
    const styles = {
        wrap: { padding: 18 } as const,
        h1: { margin: 0, fontSize: 18, fontWeight: 650, letterSpacing: -0.2 } as const,
        muted: { margin: "8px 0 0 0", fontSize: 13, opacity: 0.75 } as const,
        card: {
            marginTop: 14,
            border: "1px solid #efefef",
            borderRadius: 12,
            padding: 14,
            background: "#fafafa",
            fontSize: 13,
            opacity: 0.85,
            lineHeight: 1.35,
        } as const,
    };

    return (
        <div style={styles.wrap}>
            <h1 style={styles.h1}>Admin</h1>
            <p style={styles.muted}>User approval and system controls will live here.</p>

            <div style={styles.card}>Admin UI not implemented yet.</div>
        </div>
    );
}