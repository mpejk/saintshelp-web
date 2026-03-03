// Create topics and auto-assign books based on author/title pattern matching
// Run: node scripts/seed-topics.mjs

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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
});

// ---------- Topic definitions with matching rules ----------

const TOPICS = [
    {
        name: "Church Fathers",
        display_order: 1,
        match: (title) =>
            /augustine|chrysostom|jerome|athanasius|cyprian|gregory the great|ignatius of antioch|basil|didache|early christian/i.test(title),
    },
    {
        name: "Mystical Theology",
        display_order: 2,
        match: (title) =>
            /cloud of unknowing|dark night|interior castle|revelations of divine love|julian of norwich|john of the cross|fire of love|richard rolle|soul's journey into god|hidden life of the soul/i.test(title),
    },
    {
        name: "Prayer & Devotion",
        display_order: 3,
        match: (title) =>
            /prayer|devotion|devout life|spiritual exercises|rosary|way of perfection|visits to the blessed|way of the cross|way of salvation|lord's prayer|raccolta|uniformity with god/i.test(title),
    },
    {
        name: "Saints' Lives",
        display_order: 4,
        match: (title) =>
            /life of saint|autobiography.*ignatius|story of a soul|confessions.*augustine|life of saint teresa/i.test(title),
    },
    {
        name: "Spiritual Direction",
        display_order: 5,
        match: (title) =>
            /conferences.*cassian|pastoral care|spiritual combat|abandonment to divine|imitation of christ|ladder of divine|art of dying|on loving god|love of god.*francis de sales|spirit of saint francis de sales|brother lawrence/i.test(title),
    },
    {
        name: "Franciscan",
        display_order: 6,
        match: (title) =>
            /francis.*assisi|bonaventure|little flowers|mirror of perfection|franciscan/i.test(title),
    },
    {
        name: "Carmelite",
        display_order: 7,
        match: (title) =>
            /teresa of avila|john of the cross|therese of lisieux|carmelite/i.test(title),
    },
    {
        name: "Marian Devotion",
        display_order: 8,
        match: (title) =>
            /mary|marian|montfort|rosary|glories of mary/i.test(title),
    },
];

async function main() {
    // 1. Create topics (skip if they already exist)
    const { data: existingTopics } = await supabase.from("topics").select("id,name");
    const existingNames = new Set((existingTopics ?? []).map((t) => t.name.toLowerCase()));

    const topicMap = {}; // name → id

    // Keep existing topics
    for (const et of existingTopics ?? []) {
        topicMap[et.name.toLowerCase()] = et.id;
    }

    for (const topic of TOPICS) {
        if (existingNames.has(topic.name.toLowerCase())) {
            console.log(`Topic already exists: ${topic.name}`);
            continue;
        }

        const { data, error } = await supabase
            .from("topics")
            .insert({ name: topic.name, display_order: topic.display_order })
            .select("id")
            .single();

        if (error) {
            console.error(`Failed to create topic "${topic.name}":`, error.message);
            continue;
        }

        topicMap[topic.name.toLowerCase()] = data.id;
        console.log(`Created topic: ${topic.name} (${data.id})`);
    }

    // 2. Fetch all books
    const { data: books, error: booksErr } = await supabase
        .from("books")
        .select("id,title")
        .order("title");

    if (booksErr) {
        console.error("Failed to fetch books:", booksErr.message);
        return;
    }

    console.log(`\nFound ${books.length} books to assign topics\n`);

    // 3. Auto-assign based on patterns
    let totalAssignments = 0;

    for (const book of books) {
        const matchedTopics = [];

        for (const topicDef of TOPICS) {
            if (topicDef.match(book.title)) {
                const topicId = topicMap[topicDef.name.toLowerCase()];
                if (topicId) matchedTopics.push({ name: topicDef.name, id: topicId });
            }
        }

        if (matchedTopics.length === 0) {
            console.log(`  No topic match: ${book.title}`);
            continue;
        }

        // Delete existing associations for this book, then insert new ones
        await supabase.from("book_topics").delete().eq("book_id", book.id);

        const rows = matchedTopics.map((mt) => ({ book_id: book.id, topic_id: mt.id }));
        const { error: insertErr } = await supabase.from("book_topics").insert(rows);

        if (insertErr) {
            console.error(`  Failed to assign topics for "${book.title}":`, insertErr.message);
        } else {
            const names = matchedTopics.map((mt) => mt.name).join(", ");
            console.log(`  ${book.title} → ${names}`);
            totalAssignments += matchedTopics.length;
        }
    }

    console.log(`\nDone! ${totalAssignments} total assignments across ${books.length} books.`);
}

main().catch(console.error);
