# Diet Tracker Backend

FastAPI backend for local food search during development.

## Setup

Create and activate a virtual environment, then install the backend with development dependencies from the `backend` directory:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
```

## Run

Use uvicorn directly; this project does not require the separate `fastapi` CLI.

```powershell
python -m uvicorn app.main:app --reload
```

The local API listens on `http://127.0.0.1:8000` by default.

## Test

```powershell
python -m pytest
```