# Gradient

A web app that transforms English text progressively into Spanish through 8 levels of gradient immersion — changing syntax first, then grammar markers, then vocabulary — so readers naturally absorb the target language while reading.

## Prerequisites

- [uv](https://docs.astral.sh/uv/) (Python package manager)
- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com/)
- WeasyPrint system dependencies (for PDF export)

### WeasyPrint system dependencies (Linux/WSL)

```bash
sudo apt-get update
sudo apt-get install -y libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf2.0-0 libffi-dev libcairo2 libgirepository1.0-dev
```

On macOS:
```bash
brew install pango libffi cairo gobject-introspection
```

## Setup

### 1. Backend

```bash
cd backend

# Install dependencies
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt

# Set your API key
echo 'ANTHROPIC_API_KEY=sk-ant-your-key-here' > .env
echo 'DATABASE_URL=sqlite+aiosqlite:///./data/app.db' >> .env
echo 'ENVIRONMENT=development' >> .env
```

### 2. Frontend

```bash
cd frontend
npm install
```

## Running

You need two terminals.

**Terminal 1 — Backend** (starts on port 8000):
```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload
```

The first startup automatically creates the database and seeds 3 test users:
- **Beginner** (level 0)
- **Intermediate** (level 3)
- **Advanced** (level 5)

**Terminal 2 — Frontend** (starts on port 5173):
```bash
cd frontend
npm run dev
```

Open **http://localhost:5173** in your browser.

## Usage

1. **Select a user** from the dropdown in the header (or take the assessment chat to determine your level)
2. **Go to Dashboard** and create a new project — paste any English text (articles, book chapters, up to ~5000 words)
3. **Watch it transform** — the app splits your text into sections and progressively transforms each one through Spanish levels
4. **Read** in the two-panel reader with footnotes explaining each new Spanish element
5. **Export** to PDF, Markdown, or EPUB for offline reading

## Transformation Levels

| Level | What Changes |
|-------|-------------|
| 0 | Pure English |
| 1 | Adjectives move after nouns |
| 2 | Spanish articles (el/la/un/una) + gender endings |
| 3 | Spanish prepositions (de, en, con, por, para) |
| 4 | Verb conjugations (present tense), ser/estar |
| 5 | Object pronouns, reflexive verbs, past tense |
| 6 | ~40% vocabulary replaced with Spanish |
| 7 | Full simplified Spanish |

## Project Structure

```
backend/
  main.py              # FastAPI entry point
  config.py            # Settings (reads .env)
  database.py          # SQLite + SQLAlchemy async
  seed.py              # Predefined test users
  models/              # ORM models
  schemas/             # Pydantic request/response schemas
  routers/             # API endpoints
  services/            # Business logic (Claude, transformation, export)
  prompts/             # Level-specific prompt templates

frontend/
  src/
    pages/             # Landing, Tutorial, Assessment, Dashboard, Reader, etc.
    components/        # UI, layout, reader, assessment components
    api/client.js      # Backend API wrapper
    context/           # User state management
```

## API

Backend serves OpenAPI docs at **http://localhost:8000/docs** when running.

Key endpoints:
- `GET /api/users` — list users
- `POST /api/projects` — create a project
- `POST /api/projects/{id}/transform` — start transformation (async)
- `GET /api/jobs/{id}` — poll transformation progress
- `GET /api/projects/{id}/chapters/{num}` — read a chapter
- `GET /api/projects/{id}/export/pdf` — download PDF
- `POST /api/assessment/start` — start level assessment chat

## Known Issues

This is a POC. Known items to address:

- Claude API calls are synchronous and block the event loop during transformation — needs async client
- Level distribution for very short texts doesn't span the full 0-7 range
- Markdown export footnotes lack inline references
- No real authentication (user dropdown only)
