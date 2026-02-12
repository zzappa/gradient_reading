# Gradient Reading

Gradient Reading is an app that transforms source text into a progressive 0-7 language-learning gradient.  
Readers can move level-by-level from source-heavy text to target-language text while keeping story continuity and inline vocabulary support.

## Highlights

- FastAPI backend + React/Vite frontend
- Async transformation jobs with progress polling
- Source and target language selection per project
- 0-7 graded output with inline annotations and footnotes
- Reader with notes, side-by-side compare mode, chat, quiz, and TTS
- Dictionary view across projects with direct context deep links
- Anki-style flashcard review with multiple card schemas
- Export to PDF, Markdown, and EPUB
- Assessment flow that updates a user's starting level per language

## Supported Languages

Language configs currently include:

- `en`, `es`, `fr`, `it`, `pt`, `de`, `pl`, `ru`, `ja`, `zh`, `ko`, `he`, `ar`

- Non-Latin targets are rendered in romanized text by default, with native script available in term metadata/hover details and a native-script toggle in advanced levels.

## Prerequisites

- Python 3.10+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- Node.js 18+
- npm
- Docker + Docker Compose (optional, for containerized run)
- An [Anthropic API key](https://console.anthropic.com/)
- WeasyPrint system dependencies (for PDF export)

Linux/WSL:

```bash
sudo apt-get update
sudo apt-get install -y libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf2.0-0 libffi-dev libcairo2 libgirepository1.0-dev
```

macOS:

```bash
brew install pango libffi cairo gobject-introspection
```

## Setup

### Backend

```bash
cd backend
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt
cp .env.example .env
```

Edit `backend/.env` and set at least:

```env
ANTHROPIC_API_KEY=your-key
DATABASE_URL=sqlite+aiosqlite:///./data/app.db
ENVIRONMENT=development
```

### Frontend

```bash
cd frontend
npm install
```

## Run Locally

Use two terminals.

Backend (`http://localhost:8000`):

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload
```

Frontend (`http://localhost:5173`):

```bash
cd frontend
npm run dev
```

On first backend startup, the app initializes the database and seeds 3 users:

- `Beginner`
- `Intermediate`
- `Advanced`

## Run with Docker

At repository root:

```bash
export ANTHROPIC_API_KEY=your-key
docker compose up --build
```

Services:

- Frontend: `http://localhost:5173`
- Backend API + docs: `http://localhost:8000` and `http://localhost:8000/docs`

Notes:

- SQLite data is persisted in the named Docker volume `backend_data`.
- The frontend container proxies `/api/*` to the backend container.
- Stop stack with `docker compose down`.

## Frontend Scripts

```bash
cd frontend
npm run dev
npm run lint
npm run build
npm run preview
```

## Core Workflow

1. Select a seeded user (or run assessment).
2. Create a project with source text.
3. Choose source and target languages.
4. Start transformation and monitor progress in the processing page.
5. Open completed or in-progress levels in the reader.
6. Review vocabulary in dictionary and jump directly to usage context.
7. Create flashcards from dictionary terms and review them in the flashcard trainer.
8. Export completed projects as PDF/MD/EPUB.

## Level Model (0-7)

- Level `0`: source text
- Levels `1-5`: incremental code-switching and guided grammar transition
- Level `6`: high target-language coverage with graded-reader constraints
- Level `7`: natural target-language output

## Flashcard Scheduling

The flashcards feature is **Anki-style**, but it does **not** implement Anki's full scheduler.

Current implementation (`frontend/src/utils/flashcards.js`) is a lightweight SM-2-like model with local storage:

- Ratings: `Again`, `Hard`, `Good`, `Easy`
- Per-card stats: `interval` (days), `ease` (starts at `2.5`), `repetitions`
- Minimum ease floor: `1.3`

Review behavior:

- `Again`: decreases ease by `0.2`, resets interval to `0`, next review in `5 minutes`
- `Hard`: decreases ease by `0.15`, uses `1 day` minimum, otherwise `interval * 1.2`
- `Good`: uses `1 day` minimum, otherwise `interval * ease`
- `Easy`: increases ease by `0.15`, uses `2 days` minimum, otherwise `interval * ease * 1.3`

This means the current trainer is intentionally simple and predictable. It is not FSRS and does not perform parameter optimization from review history.

## Anki/Open-Source Note

- Anki itself is open source and its source repository is licensed under **AGPL-3.0-or-later**.
- Anki docs describe FSRS as an alternative to Anki's legacy SM-2 scheduler.
- This project currently uses an independent scheduler implementation and does not copy Anki source code.

If you copy or adapt Anki source code directly, AGPL obligations apply (for example, sharing source for networked deployments of modified AGPL code).

References:

- Anki source license: https://github.com/ankitects/anki/blob/main/LICENSE
- Anki docs (Deck Options / FSRS): https://docs.ankiweb.net/deck-options.html#fsrs
- Anki project site (open-source/free desktop app): https://apps.ankiweb.net/

## API Overview

Swagger docs: `http://localhost:8000/docs`

Common endpoints:

- `GET /api/health`
- `GET /api/users`
- `PUT /api/users/{user_id}`
- `POST /api/assessment/start`
- `POST /api/assessment/{session_id}/message`
- `GET /api/projects?user_id=...`
- `POST /api/projects`
- `POST /api/projects/{project_id}/transform`
- `GET /api/projects/{project_id}/job`
- `GET /api/jobs/{job_id}`
- `GET /api/projects/{project_id}/chapters`
- `GET /api/projects/{project_id}/chapters/{chapter_num}`
- `GET /api/dictionary?user_id=...`
- `POST /api/projects/{project_id}/chat/message`
- `POST /api/projects/{project_id}/comprehension/generate`
- `POST /api/projects/{project_id}/comprehension/evaluate`
- `GET /api/projects/{project_id}/export/pdf`
- `GET /api/projects/{project_id}/export/md`
- `GET /api/projects/{project_id}/export/epub`

## Notes
- This is a POC!
- This project currently uses seeded users and does not implement production authentication/authorization.
- Transformation quality and speed depend on Anthropic API availability and model behavior.
