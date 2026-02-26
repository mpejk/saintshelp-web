"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function TestPage() {
    const supabase = supabaseBrowser();
    const [msg, setMsg] = useState("Testing...");

    useEffect(() => {
        async function test() {
            const { error } = await supabase.from("profiles").select("id").limit(1);
            if (error) setMsg("Error: " + error.message);
            else setMsg("Supabase connected.");
        }
        test();
    }, [supabase]);

    return <main style={{ padding: 40 }}>{msg}</main>;
}