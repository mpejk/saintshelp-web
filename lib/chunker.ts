import { PDFParse } from "pdf-parse";

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
}

export function chunkText(
    text: string,
    size: number = 800,
    overlap: number = 200,
): string[] {
    const paragraphs = text.split(/\n\s*\n/);
    const chunks: string[] = [];
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

    if (current.trim()) {
        chunks.push(current.trim());
    }

    return chunks;
}
