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

Basic mode calls the basic search/detail methods with `scope=basic` and returns `sourceRegion: "US"`. It does not pretend to provide localization. Korean query support in Basic is resolved in backend before FatSecret calls: `KoreanFoodCatalog` handles Korean food identity, brand aliases, curated official nutrition, external provider ids, and provider search mappings; `app/data/korean_food_aliases.json` remains a smaller generic query translation fallback for catalog misses. FatSecret nutrition payloads are not copied into the catalog. `curated_nutrition` is only for independently verified official/reviewed nutrition sources. Unknown Korean queries and catalog hits without verified nutrition/link return a normal empty result instead of sending arbitrary Korean text or unverified branded terms to FatSecret Basic. Basic search responses do not include enough serving detail for the current DTO, so the provider caps search results at `FATSECRET_BASIC_MAX_RESULTS` and resolves missing details through bounded concurrent `food.get.v2` calls. Premier mode calls `foods.search.v5` and `food.get.v5`, passes `region` and `language`, sends `format=json`, converts page `1` to FatSecret `page_number=0`, and caps page size at 50. Premier with `region=KR` and `language=ko` sends Korean queries as-is only when catalog/alias routing does not apply. Premier search items that already include sufficient serving data do not trigger `food.get.v5`; only insufficient items use the bounded fallback.

## K-FIND Diagnostic

K-FIND/MFDS food nutrition DB support is currently diagnostic-only. It is not included in `FOOD_PROVIDER`, `create_food_provider`, or `FoodSearchService` production routing.

K-FIND variables:

| Variable | Default | Notes |
| --- | --- | --- |
| `KFOOD_API_KEY_ENCODED` | none | Public data portal Encoding key value. Use it as the `serviceKey` query value as-is; do not URL encode it again. Never expose it to frontend, docs, tests, or logs. |
| `KFOOD_BASE_URL` | `https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02` | Base service URL. |
| `KFOOD_TIMEOUT_SECONDS` | `10` | Async HTTP timeout for diagnostic requests. |

The K-FIND provider maps official output fields from the data.go.kr reference document `출력메세지_식품영양성분DB정보.xlsx`: `AMT_NUM1` is energy kcal, `AMT_NUM3` is protein g, `AMT_NUM4` is fat g, and `AMT_NUM6` is carbohydrate g. The same document defines `Z10500` as food weight. `SERVING_SIZE` values such as `100g` are parsed into amount/unit without unit conversion; only records whose parsed unit is `g` are directly compatible with the current gram-input UX.

K-FIND diagnostic search applies conservative backend ranking after upstream parsing. Exact normalized `FOOD_NM_KR` matches sort before prefix variants such as `된장찌개_두부`, and variants sort before weak contains matches. `DB_GRP_NM="음식"` and `DB_CLASS_NM="품목대표"` are ranking signals for generic food queries, not hard filters. Dedup is limited to exact duplicate `FOOD_CD` records; identical names with different `FOOD_CD` values are preserved, and suffixes such as `_1` are not interpreted or removed.

Run the read-only diagnostics from the `backend` directory:

```powershell
python scripts/inspect_kfood_api.py --check-auth
python scripts/inspect_kfood_api.py "된장찌개"
```

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
