from __future__ import annotations

import asyncio
import math
import time
from dataclasses import dataclass
from typing import Any, Callable, Literal

import httpx

from app.core.config import Settings
from app.models.food import FoodSearchRecord
from app.providers.errors import (
    FatSecretAuthenticationError,
    FatSecretConfigurationError,
    FatSecretInvalidResponseError,
    FatSecretPermissionError,
    FatSecretRateLimitError,
    FatSecretTimeoutError,
    FatSecretUnavailableError,
)
from app.providers.interfaces import (
    FoodSearchProviderLocalization,
    FoodSearchProviderResponse,
    ProviderName,
)


FATSECRET_TOKEN_ENDPOINT = "https://oauth.fatsecret.com/connect/token"
FATSECRET_API_ENDPOINT = "https://platform.fatsecret.com/rest/server.api"
MIN_PAGE_SIZE = 1
MAX_PAGE_SIZE = 50
DEFAULT_BASIC_MAX_RESULTS = 10
MAX_BASIC_PAGE_SIZE = 10
DEFAULT_DETAIL_CONCURRENCY = 4
MAX_DETAIL_CONCURRENCY = 10

JsonObject = dict[str, Any]
Clock = Callable[[], float]
FatSecretApiEdition = Literal["basic", "premier"]


@dataclass(frozen=True)
class FatSecretSearchPayload:
    food_items: list[JsonObject]
    total_results: int | None


@dataclass(frozen=True)
class FatSecretProviderConfig:
    api_edition: FatSecretApiEdition
    client_id: str
    client_secret: str
    region: str
    language: str
    timeout_seconds: float
    token_refresh_margin_seconds: float
    basic_max_results: int = DEFAULT_BASIC_MAX_RESULTS
    detail_concurrency: int = DEFAULT_DETAIL_CONCURRENCY
    token_endpoint: str = FATSECRET_TOKEN_ENDPOINT
    api_endpoint: str = FATSECRET_API_ENDPOINT

    @property
    def token_scope(self) -> str:
        return self.api_edition

    @property
    def search_method(self) -> str:
        return "foods.search.v5" if self.api_edition == "premier" else "foods.search"

    @property
    def get_method(self) -> str:
        return "food.get.v5" if self.api_edition == "premier" else "food.get.v2"

    @property
    def supports_native_korean_search(self) -> bool:
        return (
            self.api_edition == "premier"
            and self.region == "KR"
            and self.language == "ko"
        )

    @classmethod
    def from_settings(cls, settings: Settings) -> "FatSecretProviderConfig":
        api_edition = _normalize_edition(settings.fatsecret_api_edition)
        client_id = _normalize_required_secret(
            settings.fatsecret_client_id,
            "FATSECRET_CLIENT_ID",
        )
        client_secret = _normalize_required_secret(
            settings.fatsecret_client_secret,
            "FATSECRET_CLIENT_SECRET",
        )
        region = _normalize_region(settings.fatsecret_region)
        language = _normalize_language(settings.fatsecret_language)
        timeout_seconds = settings.fatsecret_timeout_seconds
        token_refresh_margin_seconds = settings.fatsecret_token_refresh_margin_seconds
        basic_max_results = settings.fatsecret_basic_max_results
        detail_concurrency = settings.fatsecret_detail_concurrency

        if timeout_seconds <= 0:
            raise FatSecretConfigurationError(
                "FATSECRET_TIMEOUT_SECONDS must be greater than 0.",
            )

        if token_refresh_margin_seconds < 0:
            raise FatSecretConfigurationError(
                "FATSECRET_TOKEN_REFRESH_MARGIN_SECONDS must be 0 or greater.",
            )

        if not MIN_PAGE_SIZE <= basic_max_results <= MAX_BASIC_PAGE_SIZE:
            raise FatSecretConfigurationError(
                f"FATSECRET_BASIC_MAX_RESULTS must be between {MIN_PAGE_SIZE} and "
                f"{MAX_BASIC_PAGE_SIZE}.",
            )

        if not 1 <= detail_concurrency <= MAX_DETAIL_CONCURRENCY:
            raise FatSecretConfigurationError(
                f"FATSECRET_DETAIL_CONCURRENCY must be between 1 and "
                f"{MAX_DETAIL_CONCURRENCY}.",
            )

        if api_edition == "basic" and (region != "US" or language != "en"):
            if region == "KR":
                raise FatSecretConfigurationError(
                    "FatSecret basic edition uses US market data only. "
                    "FATSECRET_REGION=KR requires Premier Korean market access.",
                )

            raise FatSecretConfigurationError(
                "FatSecret basic edition uses US/en data only. "
                "Use FATSECRET_API_EDITION=premier for region or language localization.",
            )

        return cls(
            api_edition=api_edition,
            client_id=client_id,
            client_secret=client_secret,
            region=region,
            language=language,
            timeout_seconds=timeout_seconds,
            token_refresh_margin_seconds=token_refresh_margin_seconds,
            basic_max_results=basic_max_results,
            detail_concurrency=detail_concurrency,
        )


class FatSecretClient:
    def __init__(
        self,
        config: FatSecretProviderConfig,
        *,
        clock: Clock = time.monotonic,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._config = config
        self._clock = clock
        self._http_client = http_client or httpx.AsyncClient(timeout=config.timeout_seconds)
        self._owns_http_client = http_client is None
        self._token_lock = asyncio.Lock()
        self._access_token: str | None = None
        self._expires_at = 0.0

    async def aclose(self) -> None:
        if self._owns_http_client:
            await self._http_client.aclose()

    async def get_access_token(self) -> str:
        now = self._clock()

        if self._cached_token_is_valid(now):
            return self._access_token or ""

        async with self._token_lock:
            now = self._clock()

            if self._cached_token_is_valid(now):
                return self._access_token or ""

            access_token, expires_in = await self._request_access_token()
            self._access_token = access_token
            self._expires_at = now + expires_in

            return access_token

    async def get_json(self, params: dict[str, str | int | bool]) -> JsonObject:
        access_token = await self.get_access_token()

        try:
            response = await self._http_client.get(
                self._config.api_endpoint,
                headers={
                    "Accept": "application/json",
                    "Authorization": f"Bearer {access_token}",
                },
                params=params,
                timeout=self._config.timeout_seconds,
            )
        except httpx.TimeoutException as exc:
            raise FatSecretTimeoutError() from exc
        except httpx.RequestError as exc:
            raise FatSecretUnavailableError() from exc

        self._raise_for_http_status(response)

        try:
            payload = response.json()
        except ValueError as exc:
            raise FatSecretInvalidResponseError() from exc

        if not isinstance(payload, dict):
            raise FatSecretInvalidResponseError()

        self._raise_for_api_error(payload)

        return payload

    def _cached_token_is_valid(self, now: float) -> bool:
        return (
            self._access_token is not None
            and now < self._expires_at - self._config.token_refresh_margin_seconds
        )

    async def _request_access_token(self) -> tuple[str, float]:
        try:
            response = await self._http_client.post(
                self._config.token_endpoint,
                auth=httpx.BasicAuth(
                    self._config.client_id,
                    self._config.client_secret,
                ),
                data={
                    "grant_type": "client_credentials",
                    "scope": self._config.token_scope,
                },
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                timeout=self._config.timeout_seconds,
            )
        except httpx.TimeoutException as exc:
            raise FatSecretTimeoutError() from exc
        except httpx.RequestError as exc:
            raise FatSecretUnavailableError() from exc

        if response.status_code in {400, 401, 403}:
            raise FatSecretAuthenticationError(
                "FatSecret authentication failed. Check FATSECRET_CLIENT_ID, "
                "FATSECRET_CLIENT_SECRET, and FATSECRET_API_EDITION.",
            )

        if response.status_code == 429:
            raise FatSecretRateLimitError()

        if response.status_code >= 500:
            raise FatSecretUnavailableError()

        if not 200 <= response.status_code < 300:
            raise FatSecretUnavailableError()

        try:
            payload = response.json()
        except ValueError as exc:
            raise FatSecretInvalidResponseError() from exc

        if not isinstance(payload, dict):
            raise FatSecretInvalidResponseError()

        access_token = payload.get("access_token")
        expires_in = _parse_positive_number(payload.get("expires_in"))

        if not isinstance(access_token, str) or access_token.strip() == "":
            raise FatSecretInvalidResponseError()

        if expires_in is None:
            raise FatSecretInvalidResponseError()

        return access_token, expires_in

    def _raise_for_http_status(self, response: httpx.Response) -> None:
        status_code = response.status_code

        if 200 <= status_code < 300:
            return

        if status_code == 401:
            raise FatSecretAuthenticationError()

        if status_code == 403:
            raise FatSecretPermissionError()

        if status_code == 429:
            raise FatSecretRateLimitError()

        if status_code in {408, 504}:
            raise FatSecretTimeoutError()

        if status_code >= 500:
            raise FatSecretUnavailableError()

        raise FatSecretUnavailableError()

    def _raise_for_api_error(self, payload: JsonObject) -> None:
        error_code = _extract_error_code(payload)

        if error_code == "20":
            raise FatSecretUnavailableError()

        if error_code == "21":
            raise FatSecretPermissionError()

        error_message = _extract_error_message(payload)

        if error_message is None:
            return

        lowered_message = error_message.casefold()
        permission_keywords = (
            "scope",
            "permission",
            "permitted",
            "forbidden",
            "localization",
            "region",
            "language",
            "ip",
        )

        if any(keyword in lowered_message for keyword in permission_keywords):
            raise FatSecretPermissionError()

        if any(keyword in lowered_message for keyword in ("auth", "credential", "token", "client")):
            raise FatSecretAuthenticationError()

        if any(keyword in lowered_message for keyword in ("rate", "quota", "limit")):
            raise FatSecretRateLimitError()

        raise FatSecretUnavailableError()


class FatSecretFoodProvider:
    def __init__(self, config: FatSecretProviderConfig, client: FatSecretClient | None = None) -> None:
        self._config = config
        self._client = client or FatSecretClient(config)

    @property
    def provider_name(self) -> ProviderName:
        return "fatsecret"

    @property
    def search_localization(self) -> FoodSearchProviderLocalization:
        supports_korean_query = self._config.supports_native_korean_search
        max_page_size = (
            self._config.basic_max_results
            if self._config.api_edition == "basic"
            else MAX_PAGE_SIZE
        )

        return FoodSearchProviderLocalization(
            region=self._config.region,
            language=self._config.language,
            supports_korean_query=supports_korean_query,
            requires_english_alias_for_korean_query=not supports_korean_query,
            max_page_size=max_page_size,
        )

    async def search_foods(
        self,
        query: str,
        page: int,
        page_size: int,
    ) -> FoodSearchProviderResponse:
        normalized_page_size = _normalize_page_size(page_size, self._config)
        page_number = max(page - 1, 0)
        params: dict[str, str | int | bool] = {
            "method": self._config.search_method,
            "search_expression": query,
            "page_number": page_number,
            "max_results": normalized_page_size,
            "format": "json",
        }

        if self._config.api_edition == "premier":
            params.update({
                "region": self._config.region,
                "language": self._config.language,
                "flag_default_serving": True,
            })

        payload = await self._client.get_json(params)
        search_payload = _extract_search_payload(payload, self._config.api_edition)
        search_items = search_payload.food_items
        total_results = search_payload.total_results
        records = await self._records_from_search_items(search_items)

        has_more = (
            page * normalized_page_size < total_results
            if total_results is not None
            else len(search_items) == normalized_page_size
        )

        return FoodSearchProviderResponse(
            items=records,
            page=page,
            page_size=normalized_page_size,
            has_more=has_more,
        )

    async def _records_from_search_items(
        self,
        search_items: list[JsonObject],
    ) -> list[FoodSearchRecord]:
        semaphore = asyncio.Semaphore(self._config.detail_concurrency)

        async def resolve_record(food_item: JsonObject) -> FoodSearchRecord | None:
            record = self._record_from_food_payload(food_item)
            food_id = _parse_optional_string(food_item.get("food_id"))

            if food_id is not None and not _record_has_sufficient_serving(record):
                async with semaphore:
                    return await self._get_food_for_search_fallback(food_id)

            return record

        tasks = [asyncio.create_task(resolve_record(food_item)) for food_item in search_items]

        if len(tasks) == 0:
            return []

        try:
            resolved_records = await asyncio.gather(*tasks)
        except Exception:
            for task in tasks:
                task.cancel()

            await asyncio.gather(*tasks, return_exceptions=True)
            raise

        return [record for record in resolved_records if record is not None]

    async def _get_food_for_search_fallback(
        self,
        food_id: str,
    ) -> FoodSearchRecord | None:
        try:
            return await asyncio.wait_for(
                self.get_food(food_id),
                timeout=self._config.timeout_seconds,
            )
        except TimeoutError as exc:
            raise FatSecretTimeoutError() from exc

    async def get_food(self, food_id: str) -> FoodSearchRecord | None:
        normalized_food_id = food_id.strip()

        if normalized_food_id == "":
            return None

        params: dict[str, str | int | bool] = {
            "method": self._config.get_method,
            "food_id": normalized_food_id,
            "format": "json",
        }

        if self._config.api_edition == "premier":
            params.update({
                "region": self._config.region,
                "language": self._config.language,
                "flag_default_serving": True,
            })

        payload = await self._client.get_json(params)
        food_payload = payload.get("food")

        if not isinstance(food_payload, dict):
            raise FatSecretInvalidResponseError()

        record = self._record_from_food_payload(food_payload)

        if record is None:
            raise FatSecretInvalidResponseError()

        return record

    def _record_from_food_payload(self, food_payload: JsonObject) -> FoodSearchRecord | None:
        food_id = _parse_optional_string(food_payload.get("food_id"))
        food_name = _parse_optional_string(food_payload.get("food_name"))

        if food_id is None or food_name is None:
            return None

        serving = _select_serving(_extract_servings(food_payload))
        source_serving_id = _parse_optional_string(serving.get("serving_id")) if serving else None
        dto_id = _build_food_id(food_id, source_serving_id)

        return FoodSearchRecord(
            id=dto_id,
            data_source="fatsecret",
            source_food_id=food_id,
            source_food_name=food_name,
            source_serving_id=source_serving_id,
            name=food_name,
            brand_name=_parse_optional_string(food_payload.get("brand_name")),
            serving_description=(
                _parse_optional_string(serving.get("serving_description"))
                if serving
                else None
            ),
            serving_size=(
                _parse_non_negative_number(serving.get("metric_serving_amount"))
                if serving
                else None
            ),
            serving_unit=(
                _parse_optional_string(serving.get("metric_serving_unit"))
                if serving
                else None
            ),
            calories_kcal=(
                _parse_non_negative_number(serving.get("calories"))
                if serving
                else None
            ),
            protein_g=(
                _parse_non_negative_number(serving.get("protein"))
                if serving
                else None
            ),
            carbs_g=(
                _parse_non_negative_number(serving.get("carbohydrate"))
                if serving
                else None
            ),
            fat_g=(
                _parse_non_negative_number(serving.get("fat"))
                if serving
                else None
            ),
            source_region=self._config.region,
        )


def _normalize_edition(value: str) -> FatSecretApiEdition:
    normalized_value = value.strip().casefold()

    if normalized_value == "basic" or normalized_value == "premier":
        return normalized_value

    raise FatSecretConfigurationError(
        "FATSECRET_API_EDITION must be either basic or premier.",
    )


def _normalize_required_secret(value: str | None, environment_name: str) -> str:
    normalized_value = value.strip() if isinstance(value, str) else ""

    if normalized_value == "":
        raise FatSecretConfigurationError(
            f"FOOD_PROVIDER=fatsecret requires {environment_name}.",
        )

    return normalized_value


def _normalize_region(value: str | None) -> str:
    normalized_value = value.strip().upper() if isinstance(value, str) else ""

    return normalized_value or "US"


def _normalize_language(value: str | None) -> str:
    normalized_value = value.strip().lower() if isinstance(value, str) else ""

    return normalized_value or "en"


def _normalize_page_size(page_size: int, config: FatSecretProviderConfig) -> int:
    max_page_size = (
        config.basic_max_results
        if config.api_edition == "basic"
        else MAX_PAGE_SIZE
    )

    return min(max(page_size, MIN_PAGE_SIZE), max_page_size)


def _extract_search_payload(
    payload: JsonObject,
    api_edition: FatSecretApiEdition,
) -> FatSecretSearchPayload:
    if api_edition == "basic":
        return _extract_basic_search_payload(payload)

    return _extract_premier_search_payload(payload)


def _extract_basic_search_payload(payload: JsonObject) -> FatSecretSearchPayload:
    foods_payload = payload.get("foods")

    if not isinstance(foods_payload, dict):
        raise FatSecretInvalidResponseError()

    return FatSecretSearchPayload(
        food_items=_normalize_search_food_items(foods_payload.get("food")),
        total_results=_parse_non_negative_int(foods_payload.get("total_results")),
    )


def _extract_premier_search_payload(payload: JsonObject) -> FatSecretSearchPayload:
    foods_search_payload = payload.get("foods_search")

    if not isinstance(foods_search_payload, dict):
        raise FatSecretInvalidResponseError()

    results_payload = foods_search_payload.get("results")

    if results_payload is None:
        food_items: list[JsonObject] = []
    elif isinstance(results_payload, dict):
        food_items = _normalize_search_food_items(results_payload.get("food"))
    else:
        raise FatSecretInvalidResponseError()

    return FatSecretSearchPayload(
        food_items=food_items,
        total_results=_parse_non_negative_int(
            foods_search_payload.get("total_results"),
        ),
    )


def _normalize_search_food_items(value: Any) -> list[JsonObject]:
    if value is None:
        return []

    if isinstance(value, dict):
        return [value]

    if isinstance(value, list):
        if all(isinstance(item, dict) for item in value):
            return value

        raise FatSecretInvalidResponseError()

    raise FatSecretInvalidResponseError()


def _extract_servings(food_payload: JsonObject) -> list[JsonObject]:
    servings_payload = food_payload.get("servings")

    if isinstance(servings_payload, dict):
        return _as_object_list(servings_payload.get("serving"))

    return _as_object_list(food_payload.get("serving"))


def _select_serving(servings: list[JsonObject]) -> JsonObject | None:
    if len(servings) == 0:
        return None

    for serving in servings:
        amount = _parse_non_negative_number(serving.get("metric_serving_amount"))
        unit = _parse_optional_string(serving.get("metric_serving_unit"))

        if amount == 100 and unit is not None and unit.casefold() == "g":
            return serving

    for serving in servings:
        if _parse_truthy(serving.get("is_default")):
            return serving

    for serving in servings:
        if _has_valid_metric_serving(serving):
            return serving

    for serving in servings:
        if _has_valid_serving_payload(serving):
            return serving

    return None


def _record_has_sufficient_serving(record: FoodSearchRecord | None) -> bool:
    if record is None:
        return False

    has_metric = (
        record.serving_size is not None
        and record.serving_size > 0
        and record.serving_unit is not None
    )
    has_nutrition = any(
        value is not None
        for value in (
            record.calories_kcal,
            record.protein_g,
            record.carbs_g,
            record.fat_g,
        )
    )

    return has_metric and has_nutrition


def _has_valid_metric_serving(serving: JsonObject) -> bool:
    amount = _parse_non_negative_number(serving.get("metric_serving_amount"))
    unit = _parse_optional_string(serving.get("metric_serving_unit"))

    return amount is not None and amount > 0 and unit is not None


def _has_valid_serving_payload(serving: JsonObject) -> bool:
    if _parse_optional_string(serving.get("serving_id")) is not None:
        return True

    if _parse_optional_string(serving.get("serving_description")) is not None:
        return True

    return any(
        _parse_non_negative_number(serving.get(field)) is not None
        for field in ("calories", "protein", "carbohydrate", "fat")
    )


def _as_object_list(value: Any) -> list[JsonObject]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]

    if isinstance(value, dict):
        return [value]

    return []


def _parse_optional_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None

    normalized_value = value.strip()

    return normalized_value or None


def _parse_non_negative_number(value: Any) -> float | None:
    parsed_value = _parse_number(value)

    if parsed_value is None or parsed_value < 0:
        return None

    return parsed_value


def _parse_positive_number(value: Any) -> float | None:
    parsed_value = _parse_number(value)

    if parsed_value is None or parsed_value <= 0:
        return None

    return parsed_value


def _parse_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None

    if isinstance(value, int | float):
        return float(value) if math.isfinite(value) else None

    if not isinstance(value, str):
        return None

    normalized_value = value.strip()

    if normalized_value == "":
        return None

    try:
        parsed_value = float(normalized_value)
    except ValueError:
        return None

    return parsed_value if math.isfinite(parsed_value) else None


def _parse_non_negative_int(value: Any) -> int | None:
    parsed_value = _parse_non_negative_number(value)

    if parsed_value is None:
        return None

    return int(parsed_value) if parsed_value.is_integer() else None


def _parse_truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value

    if isinstance(value, int):
        return value == 1

    if isinstance(value, str):
        return value.strip().casefold() in {"1", "true", "yes", "y"}

    return False


def _extract_error_code(payload: JsonObject) -> str | None:
    error_payload = payload.get("error")

    if not isinstance(error_payload, dict):
        return None

    error_code = error_payload.get("code")

    if isinstance(error_code, bool):
        return None

    if isinstance(error_code, int):
        return str(error_code)

    if isinstance(error_code, str):
        normalized_error_code = error_code.strip()

        return normalized_error_code or None

    return None



def _extract_error_message(payload: JsonObject) -> str | None:
    error_payload = payload.get("error")

    if isinstance(error_payload, dict):
        for key in ("message", "error_description", "code"):
            value = error_payload.get(key)

            if value is not None:
                return str(value)

        return "fatsecret error"

    if isinstance(error_payload, str) and error_payload.strip() != "":
        return error_payload

    return None


def _build_food_id(food_id: str, serving_id: str | None) -> str:
    if serving_id is None:
        return f"fatsecret-{food_id}"

    return f"fatsecret-{food_id}-{serving_id}"
