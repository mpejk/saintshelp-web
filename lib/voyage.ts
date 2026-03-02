const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY!;
const MODEL = "voyage-3";
const BATCH_SIZE = 128;

async function callVoyage(texts: string[], inputType: "query" | "document"): Promise<number[][]> {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${VOYAGE_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: MODEL, input: texts, input_type: inputType }),
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Voyage API error ${res.status}: ${body}`);
    }
    const json = await res.json();
    return (json.data as { embedding: number[] }[]).map((d) => d.embedding);
}

export async function embedQuery(text: string): Promise<number[]> {
    const [embedding] = await callVoyage([text], "query");
    return embedding;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        const embeddings = await callVoyage(batch, "document");
        results.push(...embeddings);
    }
    return results;
}
