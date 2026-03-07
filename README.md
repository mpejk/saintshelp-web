# SaintsHelp

A citation-only search engine over classic spiritual texts. Users ask questions and receive verbatim passages from the books — no AI-generated answers.

**Live**: [saintshelp.com](https://saintshelp.com)

## Stack

- **Framework**: Next.js 16 (App Router, client components)
- **Hosting**: Vercel
- **Database**: Supabase (PostgreSQL + pgvector + Auth + Storage)
- **Embeddings**: Voyage AI (voyage-3, 1024 dims)
- **Styling**: Inline React styles with light/dark theme system

## Features

- **Semantic search** across uploaded PDF books using vector similarity
- **Conversational context** — follow-up questions reference prior conversation
- **Full-book reader** — expand any passage to read the entire book in a scrollable overlay
- **Icon-based UI** — expand, feedback (good/confused), and copy controls on each passage
- **Book management** — admin upload, topic tagging, user book selection
- **Auth flow** — sign up, email confirm, admin approval
- **Dark mode** with flash-free hydration

## Development

```bash
npm install
npm run dev          # http://localhost:3000
npx tsc --noEmit     # type-check
```

Required environment variables in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
VOYAGE_API_KEY=
```

## Deploy

```bash
npx vercel build
npx vercel deploy --prebuilt
npx vercel alias <url> saintshelp.com
npx vercel alias <url> www.saintshelp.com
```

See [CLAUDE.md](./CLAUDE.md) for full architecture documentation.
