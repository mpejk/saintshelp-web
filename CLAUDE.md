# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from `/Users/markopejkovic/asksaints/web` (the Next.js app root).

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build (runs tsc + next build)
npm run lint     # ESLint
npx tsc --noEmit # Type-check without emitting files
```

There are no automated tests. Manual API testing is done with `curl` against the live Supabase instance using a bearer token obtained via:
```bash
curl -X POST "https://<SUPABASE_URL>/auth/v1/token?grant_type=password" \
  -H "apikey: <ANON_KEY>" -H "Content-Type: application/json" \
  -d '{"email":"...","password":"..."}'
```

Deploy to production (always alias BOTH domains — www redirects to non-www so both must point to the same deployment):
```bash
npx vercel build
npx vercel deploy --prebuilt   # captures the deployment URL
npx vercel alias <deployment-url> saintshelp.com
npx vercel alias <deployment-url> www.saintshelp.com
```

Use `vercel build` + `vercel deploy --prebuilt` (not `vercel --prod`) to bypass Vercel's remote Turbopack cache which can serve stale chunks.

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
VOYAGE_API_KEY=
```

## Architecture

SaintsHelp is a citation-only search engine over uploaded books (PDFs). Users ask questions; the system retrieves verbatim passages from the texts — no AI-generated answers.

### Auth & Access Control

Supabase Auth handles sign-in/sign-up. Every registered user gets a row in the `profiles` table with `status` (`pending` | `approved` | `blocked`) and `is_admin`. All API routes call `requireApprovedUser(req)` from `lib/authServer.ts` which:
1. Validates the Bearer JWT via the service role key
2. Checks `profiles.status === "approved"`

Admin-only routes additionally check `profile.is_admin`. New users sign up, confirm email, then wait for an admin to approve them at `/admin`. Admins are exempt from the daily ask quota.

### Two Supabase Clients

- `lib/supabaseAdmin.ts` — service role key, bypasses RLS, used in all API routes
- `lib/supabaseBrowser.ts` — anon key singleton, used in client components for auth only

### Embedding & Chunking Libraries

- `lib/voyage.ts` — Voyage AI client: `embedQuery(text)` returns 1024-dim vector, `embedTexts(texts[])` batches at 128 per call (voyage-3-lite model)
- `lib/chunker.ts` — `extractTextFromPdf(buffer)` via pdf-parse, `chunkText(text, size=800, overlap=200)` splits at paragraph boundaries

### Book Indexing (Upload Flow)

Books are indexed using **Voyage AI embeddings** stored in Supabase **pgvector**.

**Single upload** — `POST /api/books/upload` (admin only):
1. Stores the PDF in Supabase Storage (`books` bucket)
2. Inserts a row in the `books` table with `indexing_status: 'pending'`
3. Extracts text via `pdf-parse`, chunks it (800 chars, 200 overlap at paragraph boundaries)
4. Embeds chunks via Voyage AI (`voyage-3-lite`, 1024 dims) in batches of 128
5. Inserts embeddings into `book_chunks` table, sets `indexing_status: 'ready'`

**Batch upload** — 4-step client-orchestrated flow (each step <10s for Vercel free tier):
1. `POST /api/books/upload-batch` — stores up to 10 PDFs, inserts DB rows, returns immediately
2. `POST /api/books/chunk` — per book: download PDF, extract text, chunk, store raw chunks (no embeddings yet)
3. `POST /api/books/embed-batch` — per book: embed a batch of un-embedded chunks (50 at a time), client calls repeatedly
4. `POST /api/books/finalize` — per book: verify all chunks embedded, set `indexing_status: 'ready'`

Only books with `indexing_status = 'ready'` are searched.

### Ask / Search Flow

`POST /api/ask`:
1. Checks daily quota via `increment_usage_daily` Supabase RPC (50 asks/day)
2. Resolves or creates a `conversations` row
3. In parallel: fetches book metadata + resolves conversation
4. Logs the user turn to `conversation_turns`
5. Embeds the question via Voyage AI (`embedQuery`) — **one API call**
6. Searches via `supabaseAdmin.rpc("search_chunks", ...)` — **one SQL query** regardless of book count
7. For each result: sanitizes text, extracts a logical unit (numbered saying → paragraph → window), filters TOC/index noise
8. De-dupes, filters passages below `MIN_SCORE = 0.4`, then selects the **best passage per book** (diversity pass), falling back to fill up to 3 from qualified results only
9. Logs the assistant turn (stores passages including `full_text`) + request log in parallel
10. Returns passages **without** `full_text` to the client

`full_text` is only returned via `POST /api/passages/full` when the user clicks "Show full saying".

### Conversation Persistence (DB-backed)

Conversations sync across devices via Supabase:
- `GET /api/questions/random` — returns 3 random questions from Storage (no auth required)
- `GET /api/conversations` — list user's threads
- `GET /api/conversations/[id]` — load messages (strips `full_text` from passages)
- `DELETE /api/conversations/[id]` — delete thread + all turns

The frontend (`app/app/ask/page.tsx`) loads threads from the DB on mount. Book selection (which books are checked in the sidebar) is the only thing stored in localStorage, keyed by `saintshelp.selected.v1.<userId>`. When new books are added, they default to selected by merging the saved selection with the current book list.

### DB Schema (key tables)

```
profiles             id, email, status, is_admin
books                id, title, storage_path, openai_vector_store_id, openai_file_id,
                     indexing_status (pending|chunking|embedding|ready|failed), indexing_error, chunk_count
book_chunks          id, book_id, chunk_index, chunk_text, embedding (vector 1024), created_at
topics               id, name, display_order, created_at
book_topics          book_id, topic_id (many-to-many)
conversations        id, user_id, title, created_at
conversation_turns   id, conversation_id, role, question, selected_book_ids, answer_passages, created_at
requests             id, user_id, kind (quota tracking)
```

SQL function `search_chunks(query_embedding, book_ids, match_count, similarity_threshold)` performs the pgvector similarity search.

`answer_passages` is JSONB: `{ passages: [{ id, book_id, book_title, score, text, full_text }] }`. The `full_text` stored server-side is used by `/api/passages/full`; clients only see `text` (truncated preview).

### Topics & Book Browsing

- `GET/POST /api/topics` — list/create topics (admin only for POST)
- `DELETE /api/topics/[id]` — delete topic (admin only)
- `POST /api/books/[id]/topics` — assign topic IDs to a book (admin only)

The books page (`app/app/books/page.tsx`) is open to **all approved users**:
- Admin section (upload + topic management) shown only to admins
- Book browsing: search bar, topic filter pills, checkboxes for book selection
- Selection persisted in localStorage (same `saintshelp.selected.v1.<userId>` key)

The ask page sidebar shows a compact summary ("Selected: 12/87 books") with a "Manage Books" link instead of the full checkbox list.

### Frontend Structure

All authenticated app pages live under `app/app/` with a shared layout. Pages are pure client components — no server components with data fetching. Auth token is retrieved from Supabase client session before each API call and passed as `Authorization: Bearer <token>`.

No Tailwind is used in components — all styles are inline `React.CSSProperties` objects defined at the top of each component, computed from the `tc(isDark)` theme palette.

### Light / Dark Theme

`lib/theme.tsx` exports:
- `ThemeProvider` — wraps the app in `app/layout.tsx`; reads/writes `data-theme` on `<html>` and `saintshelp.theme` in localStorage
- `useTheme()` — returns `{ isDark, toggle }`
- `tc(isDark)` — returns a typed palette object (`pageBg`, `cardBg`, `fg`, `fgMuted`, `border`, `btnBg/Fg/Border`, `btnActiveBg/Fg/Border`, `suggestionBg/Border`, `copyActiveBg/Fg`)

An inline `<script>` in `<head>` (in `app/layout.tsx`) applies `data-theme` before React hydrates to prevent flash. All page components call `const { isDark, toggle } = useTheme()` and `const t = tc(isDark)` at the top.

**Variable name caution**: when iterating with `.map((t) => ...)`, the iteration variable `t` shadows the outer theme `t`. Use `tc(isDark).propName` explicitly inside such callbacks instead of the outer `t`. Same applies to any local `const t = ...` inside event handlers.

**Logo**: the SVG (`/public/logo.svg`) has hardcoded `fill="#000000"`. Make it theme-aware by adding `filter: isDark ? "invert(1)" : "none"` to the `<img>` style. Applied in all 4 logo locations: app topbar, admin topbar, landing page, login page.

CSS dark mode overrides for class-based sticky elements (`.app-topbar`, `.ask-input-row`) live in `app/globals.css` under `[data-theme="dark"]` selectors. These are needed because sticky elements sit on top of the page background and need an explicit background color.

**All inner pages** (`app/app/page.tsx`, `app/app/books/page.tsx`, `app/admin/page.tsx`) must also use `tc(isDark)` — they are not covered by the layout's theme since inline styles don't inherit.

### Suggested Questions

30 generic suggested questions are stored as `config/questions.json` in a private Supabase Storage bucket. `GET /api/questions/random` downloads the file and returns 3 randomly sampled questions. To update the questions, upload a new JSON file: `{ "questions": ["..."] }` to the `config` bucket with `x-upsert: true` — no redeploy needed.

### Key Constraints

- Supabase keys use the new `sb_secret_` / `sb_publishable_` format — these are **not** JWTs and do not work as PostgreSQL passwords or with the Supabase Management API (which requires a Personal Access Token starting with `sbp_`). DDL must be run in the Supabase dashboard SQL editor.
- `next.config.ts` sets `generateBuildId: async () => \`build-\${Date.now()}\`` to force unique static asset paths on each deploy, preventing CDN stale-chunk issues.
- Mobile scroll uses `overflow-x: clip` (not `hidden`) on `html, body` — `overflow-x: hidden` implicitly creates a scroll container which breaks `position: sticky` and `window.scrollTo`.
