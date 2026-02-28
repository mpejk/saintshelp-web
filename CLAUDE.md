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

Deploy to production:
```bash
npx vercel --prod --yes
npx vercel alias <deployment-url> saintshelp.com
```

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
```

## Architecture

SaintsHelp is a citation-only search engine over uploaded books (PDFs). Users ask questions; the system retrieves verbatim passages from the texts — no AI-generated answers.

### Auth & Access Control

Supabase Auth handles sign-in/sign-up. Every registered user gets a row in the `profiles` table with `status` (`pending` | `approved` | `blocked`) and `is_admin`. All API routes call `requireApprovedUser(req)` from `lib/authServer.ts` which:
1. Validates the Bearer JWT via the service role key
2. Checks `profiles.status === "approved"`

Admin-only routes additionally check `profile.is_admin`. New users sign up, confirm email, then wait for an admin to approve them at `/admin`.

### Two Supabase Clients

- `lib/supabaseAdmin.ts` — service role key, bypasses RLS, used in all API routes
- `lib/supabaseBrowser.ts` — anon key singleton, used in client components for auth only

### Book Indexing (Upload Flow)

`POST /api/books/upload` (admin only):
1. Stores the PDF in Supabase Storage (`books` bucket)
2. Inserts a row in the `books` table
3. Creates an OpenAI vector store for the book
4. Uploads the PDF as an OpenAI file and attaches it to the vector store via `createAndPoll` (waits for indexing to complete)
5. Saves `openai_vector_store_id` and `openai_file_id` back to the `books` row

Books without `openai_vector_store_id` are silently skipped during search.

### Ask / Search Flow

`POST /api/ask`:
1. Checks daily quota via `increment_usage_daily` Supabase RPC (50 asks/day)
2. Resolves or creates a `conversations` row
3. In parallel: fetches book metadata + resolves conversation
4. Logs the user turn to `conversation_turns`
5. Searches all selected books **in parallel** via `Promise.all` over `openai.vectorStores.search`
6. For each result: sanitizes text, extracts a logical unit (numbered saying → paragraph → window), filters TOC/index noise
7. De-dupes and sorts by relevance score
8. Logs the assistant turn (stores passages including `full_text`) + request log in parallel
9. Returns passages **without** `full_text` to the client

`full_text` is only returned via `POST /api/passages/full` when the user clicks "Show full saying".

### Conversation Persistence (DB-backed)

Conversations sync across devices via Supabase:
- `GET /api/conversations` — list user's threads
- `GET /api/conversations/[id]` — load messages (strips `full_text` from passages)
- `DELETE /api/conversations/[id]` — delete thread + all turns

The frontend (`app/app/ask/page.tsx`) loads threads from the DB on mount. Book selection (which books are checked in the sidebar) is the only thing stored in localStorage, keyed by `saintshelp.selected.v1.<userId>`. When new books are added, they default to selected by merging the saved selection with the current book list.

### DB Schema (key tables)

```
profiles             id, email, status, is_admin
books                id, title, storage_path, openai_vector_store_id, openai_file_id
conversations        id, user_id, title, created_at
conversation_turns   id, conversation_id, role, question, selected_book_ids, answer_passages, created_at
requests             id, user_id, kind (quota tracking)
```

`answer_passages` is JSONB: `{ passages: [{ id, book_id, book_title, score, text, full_text }] }`. The `full_text` stored server-side is used by `/api/passages/full`; clients only see `text` (truncated preview).

### Frontend Structure

All authenticated app pages live under `app/app/` with a shared layout. Pages are pure client components — no server components with data fetching. Auth token is retrieved from Supabase client session before each API call and passed as `Authorization: Bearer <token>`.

No Tailwind is used in components — all styles are inline `React.CSSProperties` objects defined at the top of each component.
