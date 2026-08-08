# Diet Tracker Backend

FastAPI backend for food search. The frontend always calls this backend API; the backend selects the configured food provider.

## Setup

Create and activate a virtual environment, then install the backend with development dependencies from the `backend` directory:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
```

## Provider Configuration

`FOOD_PROVIDER` selects the backend implementation:

| Value | Behavior |
| --- | --- |
| `mock` | Uses local mock foods. No external calls. |
| `fatsecret` | Uses FatSecret OAuth 2.0 client credentials and FatSecret food APIs. Missing credentials are a configuration error; the app does not silently fall back to mock. |

FatSecret variables:

| Variable | Default | Notes |
| --- | --- | --- |
| `FATSECRET_API_EDITION` | `basic` | `basic` or `premier`. Also controls OAuth scope. |
| `FATSECRET_CLIENT_ID` | none | Required when `FOOD_PROVIDER=fatsecret`. |
| `FATSECRET_CLIENT_SECRET` | none | Required when `FOOD_PROVIDER=fatsecret`. Never expose to frontend. |
| `FATSECRET_REGION` | `US` | Basic supports only US data in this app. `KR` requires Premier Korean market access. |
| `FATSECRET_LANGUAGE` | `en` | Basic supports only `en` in this app. Premier can pass localized values. |
| `FATSECRET_TIMEOUT_SECONDS` | `10` | Async HTTP timeout. |
| `FATSECRET_TOKEN_REFRESH_MARGIN_SECONDS` | `60` | Access token refresh margin before expiry. |
| `FATSECRET_BASIC_MAX_RESULTS` | `10` | Basic edition search result cap. Valid range is `1` to `10`. |
| `FATSECRET_DETAIL_CONCURRENCY` | `4` | Maximum concurrent `food.get` fallback requests. Valid range is `1` to `10`. |

Basic mode calls the basic search/detail methods with `scope=basic` and returns `sourceRegion: "US"`. It does not pretend to provide localization. Korean query support in Basic is a temporary query-only alias layer in `app/data/korean_food_aliases.json`; it translates clear Korean food aliases to English before the FatSecret request and leaves nutrition values and FatSecret food names untouched. Unknown Korean aliases return a normal empty result with explicit query metadata. Basic search responses do not include enough serving detail for the current DTO, so the provider caps search results at `FATSECRET_BASIC_MAX_RESULTS` and resolves missing details through bounded concurrent `food.get.v2` calls. Premier mode calls `foods.search.v5` and `food.get.v5`, passes `region` and `language`, sends `format=json`, converts page `1` to FatSecret `page_number=0`, and caps page size at 50. Premier with `region=KR` and `language=ko` sends Korean queries as-is and does not apply alias translation. Premier search items that already include sufficient serving data do not trigger `food.get.v5`; only insufficient items use the bounded fallback.

## Run

Use uvicorn directly; this project does not require the separate `fastapi` CLI.

```powershell
python -m uvicorn app.main:app --reload
```

The local API listens on `http://127.0.0.1:8000` by default.

## Test

Tests use mocked HTTP transports and do not call FatSecret servers.

```powershell
python -m pytest
```
