/** Shared text cleaning utilities for PDF chunk processing */

export function sanitizeText(s: string) {
    return String(s ?? "")
        .normalize("NFKC")
        .replace(/[\u00A0\u1680\u180E\u2000-\u200A\u202F\u205F\u3000]/g, " ")
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
        .replace(/[\uFEFF\uFFFD\uFFFE\uFFFF]/g, "")
        .replace(/[\u200B\u200C\u200D\u2060]/g, "")
        // Common PDF encoding artifacts
        .replace(/\ufb01/g, "fi").replace(/\ufb02/g, "fl")
        .replace(/\ufb00/g, "ff").replace(/\ufb03/g, "ffi").replace(/\ufb04/g, "ffl")
        .replace(/\u2019/g, "\u2019") // normalize right single quote
        .replace(/\u201C/g, "\u201C").replace(/\u201D/g, "\u201D") // normalize double quotes
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export function dewrapPdfLines(s: string) {
    if (!s) return "";
    s = s.replace(/\r\n?/g, "\n");
    s = s.replace(/\n(?!\n)/g, " ");
    s = s.replace(/[ \t]+/g, " ");
    s = s.replace(/\n\n+/g, "\n\n");
    s = s.replace(/(\w)- (\w)/g, "$1$2");
    s = s.replace(/\[\s*\d+(?:\s+\d+)*\s*\]?/g, "");
    s = s.replace(/\s{2,}/g, " ");
    return s.trim();
}

export function stripPageMarkers(s: string): string {
    return s.replace(/--\s*\d+\s+of\s+\d+\s*--/g, "");
}

export function stripAuthorTitleLines(s: string): string {
    return s.split("\n").filter((line) => {
        return !/\t/.test(line.trim());
    }).join("\n");
}

export function stripFootnoteLines(s: string): string {
    return s.split("\n").filter((line) => {
        const t = line.trim();
        if (!t) return true;
        if (/^\d{1,3}\s+\S/.test(t) && t.length < 80) return false;
        if (/^\*\s*\d/.test(t)) return false;
        return true;
    }).join("\n");
}

export function stripHeaderLines(s: string): string {
    return s.split("\n").filter((line) => {
        const t = line.trim();
        if (!t) return true;
        if (/^(CHAPTER|BOOK|PART|SECTION)\s+([IVXLCDM]+|\d+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN)\b/i.test(t)) return false;
        if (/^[Tt]he\s+\w+\s+(Chapter|Book|Part)\b/i.test(t)) return false;
        if (/^[A-Z][A-Z\s]{2,40}$/.test(t) && t.split(/\s+/).length <= 5) return false;
        return true;
    }).join("\n");
}

export function stripInlineHeaders(s: string): string {
    let t = s;
    t = t.replace(/\s+(?:CHAPTER|BOOK|PART|SECTION)\s+(?:[IVXLCDM]+|\d+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN)\b\.?(?:\s+[A-Z][^.!?]{0,80}[.!?])?/g, " ");
    t = t.replace(/\s+[Tt]he\s+\w+\s+(?:Chapter|Book|Part)\b(?:\s+[A-Z][^.!?]{0,80}[.!?])?/g, " ");
    t = t.replace(/\b((?:\w+\s+){2,8})\1/g, "$1");
    t = t.replace(/\s+[A-Z][a-zA-Z ,.''-]{4,80}[a-z]\d{2,4}(?=\s|$)/g, " ");
    t = t.replace(/\s{2,}/g, " ").trim();
    return t;
}

export function stripLikelyHeaderFooterLines(s: string): string {
    const lines = (s ?? "").split("\n");
    const cleaned = lines.filter((line) => {
        const t = line.trim();
        if (!t) return true;
        if (/^\s*\d{1,5}\s*$/.test(t)) return false;
        if (/^\s*p\.?\s*\d{1,5}\s*$/i.test(t)) return false;
        if (/douay[-\s]?rheims/i.test(t) && /\bbible\b/i.test(t)) return false;
        if ((t.match(/\.{5,}/g) ?? []).length >= 1 && t.length < 120) return false;
        return true;
    });
    return cleaned.join("\n").trim();
}

export function trimLeadingFragment(s: string): string {
    if (!s) return s;
    if (/^[A-Z"'\u2018\u201C\u201D(\d]/.test(s)) return s;
    const clauseMatch = s.match(/^[a-z][^.!?;]{0,38}?(?=[A-Z"'\u2018\u201C])/);
    if (clauseMatch) {
        s = s.slice(clauseMatch[0].length);
    }
    if (/^[A-Z"'\u2018\u201C\u201D(\d]/.test(s)) return s;
    if (/^[a-z]/.test(s)) {
        const sentIdx = s.search(/[.!?;]\s+[A-Z"'\u2018\u201C]/);
        if (sentIdx >= 0 && sentIdx < 200) {
            const afterPunct = s.slice(sentIdx + 1).search(/[A-Z"'\u2018\u201C]/);
            if (afterPunct >= 0) return s.slice(sentIdx + 1 + afterPunct);
        }
        const quoteIdx = s.search(/['"'\u2018\u201C]/);
        if (quoteIdx >= 0 && quoteIdx < 100) return s.slice(quoteIdx);
        return "\u2026" + s;
    }
    return s;
}

export function trimTrailingFragment(s: string): string {
    if (!s) return s;
    s = s.replace(/\s+[a-z]{1,12}$/, "");
    s = s.replace(/\s+[A-Z][a-z]+$/, "");
    const trimmed = s.trim();
    if (trimmed && !/[.!?;'"\u2019\u201D)]$/.test(trimmed)) {
        const lastEnd = Math.max(
            trimmed.lastIndexOf(". "),
            trimmed.lastIndexOf(".' "),
            trimmed.lastIndexOf("? "),
            trimmed.lastIndexOf("! "),
            trimmed.lastIndexOf("; "),
            trimmed.lastIndexOf(".\u201D"),
            trimmed.lastIndexOf(".\""),
        );
        const lastTerminal = Math.max(
            trimmed.lastIndexOf("."),
            trimmed.lastIndexOf("?"),
            trimmed.lastIndexOf("!"),
            trimmed.lastIndexOf(";"),
        );
        const best = Math.max(lastEnd, lastTerminal);
        if (best > trimmed.length * 0.2) {
            return trimmed.slice(0, best + 1).trim();
        }
    }
    return trimmed;
}

/** Clean a raw chunk text through the full pipeline */
export function cleanChunkText(raw: string): string {
    let text = sanitizeText(raw);
    text = stripPageMarkers(text);
    text = stripAuthorTitleLines(text);
    text = stripFootnoteLines(text);
    text = stripHeaderLines(text);
    text = stripLikelyHeaderFooterLines(text);
    text = text.replace(/\n{3,}/g, "\n\n").trim();
    text = stripLikelyHeaderFooterLines(sanitizeText(text));
    text = stripInlineHeaders(dewrapPdfLines(text));
    text = trimTrailingFragment(trimLeadingFragment(text));
    return text;
}
