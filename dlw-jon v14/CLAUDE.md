# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start full-stack dev server (Express + Vite) on port 3000
npm run build     # Production build with Vite
npm run preview   # Preview production build
npm run clean     # Remove dist folder
npm run lint      # TypeScript type checking (tsc --noEmit)
```

The dev server serves both the API and the Vite frontend from a single Express process on `http://localhost:3000`.

## Architecture

Single Express server (`server.ts`) that:
1. Mounts REST API routes under `/api/*`
2. Serves the Vite-bundled React frontend (or Vite dev middleware in development)

**Data hierarchy:** User → Subject → Topic → Question → Attempt

### Backend (`server/`)

- `db.ts` — SQLite initialization via `better-sqlite3`. All schema creation and foreign key setup lives here. Database file: `learning_platform.db`.
- `middleware/auth.ts` — JWT verification middleware; attaches `req.user = { id, email }` to requests.
- `routes/` — One file per resource: `auth`, `subjects`, `topics`, `questions`, `quiz`, `report`, `context`, `calendar`.

**Auth flow:** Register/login returns a JWT (24h expiry, secret from `JWT_SECRET` env or `'dev-secret-key-change-in-prod'`). All routes except `/api/auth/*` and `/api/health` require `Authorization: Bearer <token>`.

**Quiz flow:** `GET /api/quiz?topic_id=<id>` returns 5 random questions. `POST /api/quiz/submit` stores per-question attempts with timing, confidence level, and triggers Ollama AI explanations for incorrect answers.

### Frontend (`src/`)

- `App.tsx` — React Router setup; wraps protected routes with `ProtectedRoute` component.
- `pages/` — One file per route. `Dashboard.tsx` is the main hub for subject/topic management.
- No shared component library beyond `ProtectedRoute.tsx`; pages are largely self-contained.

### AI Integration

Ollama (local HTTP API) is used in `server/lib/ai.ts`, with routes calling `generateText(...)`. The model defaults to `deepseek-v3.1:671b-cloud` and can be overridden via `OLLAMA_MODEL`. Base URL can be overridden via `OLLAMA_BASE_URL`.

### Key Patterns

- **Options and concept_tags** on questions are stored as JSON strings in SQLite and must be parsed on read.
- **Session grouping** for quiz attempts uses a `session_id` (UUID) passed in the submit payload.
- **File uploads** use Multer; PDFs are parsed with `pdf-parse` and stored in `server/uploads/`.
- TypeScript path alias `@/*` maps to the repo root.
