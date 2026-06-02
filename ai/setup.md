# Setup Guide

How to run TradingAgent locally and with Docker. Read this before asking why
something does not start.

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Python | 3.10, 3.11, or 3.12 | 3.13 is NOT supported |
| Node.js | 18+ | For the React frontend |
| npm | 9+ | Comes with Node.js |
| Git | any | |
| Conda (optional) | any | Recommended on Windows for Python version management |

---

## Environment Setup - Windows (Recommended: Conda)

The host machine may have Python 3.13 installed globally. The backend requires
Python 3.10-3.12. Use a conda env to isolate this.

```powershell
# Create a Python 3.12 environment
conda create -n tradingagents python=3.12 -y
conda activate tradingagents

# Verify
python --version   # must show 3.12.x
```

---

## Backend Setup

```bash
cd TradingAgent/backend

# Install the core agent engine as an editable package first
pip install -e ./tradingagents-core

# Install backend dependencies
pip install -r requirements.txt

# Install dev dependencies (for running tests)
pip install -r requirements-dev.txt
```

### Configure Environment Variables

```bash
# Copy the example file
cp .env.example .env

# Open .env and fill in at minimum:
#   LLM_PROVIDER=google
#   DEEP_THINK_LLM=gemini-2.5-pro
#   QUICK_THINK_LLM=gemini-2.5-flash
#   GOOGLE_API_KEY=your-key-here
#   APP_ENV=development
```

**The backend will refuse to start if `LLM_PROVIDER`, `DEEP_THINK_LLM`,
or `QUICK_THINK_LLM` are missing or invalid.**

### Start the Backend

```bash
cd TradingAgent/backend
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Successful startup looks like:
```
INFO: Startup validation passed. Provider: google | deep: gemini-2.5-pro | quick: gemini-2.5-flash
INFO: Application startup complete.
INFO: Uvicorn running on http://127.0.0.1:8000
```

---

## Frontend Setup

```bash
cd TradingAgent/frontend

# Install dependencies
npm install

# Copy env example
cp .env.example .env
```

The default `.env` already sets `VITE_API_URL=http://localhost:8000`. No changes
needed for local dev unless you use a different backend port.

### Enable Mock Route (optional)

For UI development without the backend, enable the mock route:

```
VITE_ENABLE_MOCK=true
```

Then access `/analysis.test` in the browser.

### Start the Frontend

```bash
npm run dev
```

Frontend runs at `http://localhost:3000`.

---

## Running Tests

### Backend Tests

```bash
cd TradingAgent/backend

# Run all unit tests (fast, no external calls)
pytest tests/ -m "not integration and not live_api" -v

# Run with coverage
pytest tests/ -m "not integration and not live_api" --cov=. --cov-report=term-missing

# Run core package tests separately
cd tradingagents-core
pytest tests/ -m "not integration and not live_api" -v
```

### Frontend Tests

```bash
cd TradingAgent/frontend

# Run all tests
npm test

# Run once without watch mode (for CI)
npm test -- --run

# Run with coverage
npm test -- --run --coverage
```

### Full Quality Check

```bash
# Backend
cd backend
python -m ruff check .
python -m ruff format --check .
pytest tests/ -m "not integration and not live_api"

# Frontend
cd frontend
npm run quality     # lint + format check + tests
```

---

## Docker Setup

```bash
# Copy env files first
cp backend/.env.example backend/.env
# Fill in LLM_PROVIDER, API keys, etc. in backend/.env

# Build and start both containers
docker-compose up --build

# Start in background
docker-compose up -d --build

# View backend logs
docker-compose logs -f backend

# Stop everything
docker-compose down
```

Frontend: `http://localhost:3000`
Backend: `http://localhost:8000`
Health check: `http://localhost:8000/health`

---

## Common Startup Problems

### Backend refuses to start

Symptom: `STARTUP CONFIG ERROR: ...` in logs followed by exit.

Fix: Check your `backend/.env`. The most common causes:
- `LLM_PROVIDER` is blank
- `DEEP_THINK_LLM` or `QUICK_THINK_LLM` is blank
- `GOOGLE_API_KEY` (or whichever provider key) is missing
- `APP_ENV` is missing (defaults to `production` which restricts CORS)

### CORS errors in browser

Symptom: `Access-Control-Allow-Origin` errors in the browser console.

Fix:
1. Make sure `APP_ENV=development` is set in `backend/.env`.
2. Make sure `CORS_ORIGINS` includes `http://localhost:3000`.

### `tradingagents` module not found

Symptom: `ModuleNotFoundError: No module named 'tradingagents'`

Fix:
```bash
cd backend
pip install -e ./tradingagents-core
```

The core package must be installed as an editable package. It is listed in
`requirements.txt` as `-e ./tradingagents-core` but sometimes gets lost if you
install into a different venv.

### Node.js not found after installing on Windows

Symptom: `npm` or `node` not recognized in PowerShell.

Fix: Close and reopen PowerShell, or restart the system. Windows PATH updates
do not apply to already-open terminal sessions.

### Frontend shows blank page or import errors

Symptom: Vite build fails or blank screen.

Check:
- All files containing JSX have `.jsx` extension, not `.js`.
- Only one `index.html` exists at `frontend/index.html`. Remove `frontend/public/index.html` if it exists.

---

## LLM Provider Reference

| Provider | `LLM_PROVIDER` value | Key Variable | Recommended Models |
|---|---|---|---|
| Google Gemini | `google` | `GOOGLE_API_KEY` or `GEMINI_API_KEY` | `gemini-2.5-flash`, `gemini-2.5-pro` |
| OpenAI | `openai` | `OPENAI_API_KEY` | `gpt-4o`, `gpt-4o-mini` |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` | `claude-opus-4-5`, `claude-sonnet-4-5` |
| DeepSeek | `deepseek` | `DEEPSEEK_API_KEY` | `deepseek-chat`, `deepseek-reasoner` |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` | any model slug |
| Ollama (local) | `ollama` | none | `qwen3:latest`, any installed model |

For Ollama, also set:
```
OLLAMA_BASE_URL=http://localhost:11434
```

**Minimum recommended for production quality results:**
- `QUICK_THINK_LLM`: `gemini-2.5-flash` or equivalent
- `DEEP_THINK_LLM`: `gemini-2.5-pro` or equivalent

Weak models (e.g. small local models) produce inconsistent structured output
which causes pipeline validation errors.
