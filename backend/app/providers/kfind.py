from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any, Literal

import httpx

from app.core.config import Settings
from app.models.food import FoodSearchRecord, NutritionSourceMetadata
from app.providers.errors import (
    FoodProviderError,
    KfindAuthenticationError,
    KfindConfigurationError,
    KfindInvalidResponseError,
    KfindPermissionError,
    KfindRateLimitError,
    KfindTimeoutError,
    KfindUnavailableError,
)
from app.providers.interfaces import ProviderName
from app.providers.kfind_ranking import rank_kfind_results


KFIND_DEFAULT_BASE_URL = "https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02"
KFIND_SEARCH_ENDPOINT = "getFoodNtrCpntDbInq02"
KFIND_DATA_SOURCE = "kfind"
KFIND_SOURCE_REGION = "KR"
KFIND_DEFAULT_SOURCE_NAME = "MFDS Food Nutrition DB"
KFIND_AUTH_CHECK_QUERY = "된장찌개"
MIN_PAGE_SIZE = 1
MAX_PAGE_SIZE = 100
KFIND_UPSTREAM_PAGE_FOR_RANKING = 1
KFIND_FETCH_WINDOW_MULTIPLIER = 2
KFIND_MAX_FETCH_SIZE = MAX_PAGE_SIZE

# Official reference: data.go.kr 15127578, output message document
# `출력메세지_식품영양성분DB정보.xlsx`.
CORE_NUTRIENT_FIELDS = {
    "calories_kcal": "AMT_NUM1",
    "protein_g": "AMT_NUM3",
    "fat_g": "AMT_NUM4",
    "carbs_g": "AMT_NUM6",
}
CORE_NUTRIENT_FIELD_LABELS = {
    "AMT_NUM1": "에너지(kcal)",
    "AMT_NUM2": "수분(g)",
    "AMT_NUM3": "단백질(g)",
    "AMT_NUM4": "지방(g)",
    "AMT_NUM5": "회분(g)",
    "AMT_NUM6": "탄수화물(g)",
}
IDENTITY_AND_PROVENANCE_FIELDS = (
    "FOOD_CD",
    "FOOD_NM_KR",
    "DB_GRP_NM",
    "DB_CLASS_NM",
    "FOOD_OR_NM",
    "FOOD_CAT1_NM",
    "FOOD_REF_NM",
    "FOOD_CAT2_NM",
    "SERVING_SIZE",
    "SUB_REF_NAME",
    "DISH_ONE_SERVING",
    "Z10500",
    "MAKER_NM",
    "IMP_MANUFAC_NM",
    "SELLER_MANUFAC_NM",
    "CRT_MTH_NM",
    "RESEARCH_YMD",
    "UPDATE_DATE",
)
KFIND_CATEGORY_AUTH = "auth"
KFIND_CATEGORY_PERMISSION = "permission"
KFIND_CATEGORY_RATE_LIMIT = "rate_limit"
KFIND_CATEGORY_TIMEOUT = "timeout"
KFIND_CATEGORY_UNAVAILABLE = "unavailable"
KFIND_CATEGORY_MALFORMED_RESPONSE = "malformed_response"
KFIND_ERROR_CATEGORIES = frozenset({
    KFIND_CATEGORY_AUTH,
    KFIND_CATEGORY_PERMISSION,
    KFIND_CATEGORY_RATE_LIMIT,
    KFIND_CATEGORY_TIMEOUT,
    KFIND_CATEGORY_UNAVAILABLE,
    KFIND_CATEGORY_MALFORMED_RESPONSE,
})
SERVING_SIZE_PATTERN = re.compile(
    r"^\s*(?P<amount>\d+(?:\.\d+)?)\s*(?P<unit>[^\d\s]+)\s*$"
)
JsonObject = dict[str, Any]
KfindErrorCategory = Literal[
    "auth",
    "permission",
    "rate_limit",
    "timeout",
    "unavailable",
    "malformed_response",
]


@dataclass(frozen=True)
class KfindProviderConfig:
    service_key_encoded: str = field(repr=False)
    base_url: str = KFIND_DEFAULT_BASE_URL
    timeout_seconds: float = 10.0

    def __post_init__(self) -> None:
        _normalize_required_secret(self.service_key_encoded, "KFOOD_API_KEY_ENCODED")

    @classmethod
    def from_settings(cls, settings: Settings) -> "KfindProviderConfig":
        service_key_encoded = _normalize_required_secret(
            settings.kfood_api_key_encoded,
            "KFOOD_API_KEY_ENCODED",
        )
        timeout_seconds = settings.kfood_timeout_seconds

        if timeout_seconds <= 0:
            raise KfindConfigurationError(
                "KFOOD_TIMEOUT_SECONDS must be greater than 0.",
            )

        return cls(
            service_key_encoded=service_key_encoded,
            base_url=_normalize_base_url(settings.kfood_base_url),
            timeout_seconds=timeout_seconds,
        )


@dataclass(frozen=True)
class KfindFetchWindowPolicy:
    fetch_multiplier: int = KFIND_FETCH_WINDOW_MULTIPLIER
    max_fetch_size: int = KFIND_MAX_FETCH_SIZE

    def __post_init__(self) -> None:
        if self.fetch_multiplier < 1:
            raise ValueError("K-FIND fetch_multiplier must be 1 or greater.")

        if self.max_fetch_size < MIN_PAGE_SIZE:
            raise ValueError("K-FIND max_fetch_size must be 1 or greater.")

    @property
    def effective_max_fetch_size(self) -> int:
        return min(self.max_fetch_size, MAX_PAGE_SIZE)

    def fetch_size(self, *, page_size: int) -> int:
        return min(page_size * self.fetch_multiplier, self.effective_max_fetch_size)


@dataclass(frozen=True)
class KfindProviderErrorMetadata:
    provider: str
    category: KfindErrorCategory
    upstream_code: str | None
    operation: str | None


@dataclass(frozen=True)
class KfindFoodMetadata:
    db_group_name: str | None
    db_class_name: str | None
    food_origin_name: str | None
    food_category1_name: str | None
    food_reference_name: str | None
    food_category2_name: str | None
    serving_size_raw: str | None
    source_name: str | None
    dish_one_serving: str | None
    food_weight: str | None
    maker_name: str | None
    import_manufacturer_name: str | None
    seller_manufacturer_name: str | None
    creation_method_name: str | None
    research_date: str | None
    update_date: str | None
    raw_fields: dict[str, str | None]

    @classmethod
    def from_item(cls, item: JsonObject) -> "KfindFoodMetadata":
        raw_fields = {
            field_name: _parse_optional_string(item.get(field_name))
            for field_name in IDENTITY_AND_PROVENANCE_FIELDS
        }

        return cls(
            db_group_name=raw_fields["DB_GRP_NM"],
            db_class_name=raw_fields["DB_CLASS_NM"],
            food_origin_name=raw_fields["FOOD_OR_NM"],
            food_category1_name=raw_fields["FOOD_CAT1_NM"],
            food_reference_name=raw_fields["FOOD_REF_NM"],
            food_category2_name=raw_fields["FOOD_CAT2_NM"],
            serving_size_raw=raw_fields["SERVING_SIZE"],
            source_name=raw_fields["SUB_REF_NAME"],
            dish_one_serving=raw_fields["DISH_ONE_SERVING"],
            food_weight=raw_fields["Z10500"],
            maker_name=raw_fields["MAKER_NM"],
            import_manufacturer_name=raw_fields["IMP_MANUFAC_NM"],
            seller_manufacturer_name=raw_fields["SELLER_MANUFAC_NM"],
            creation_method_name=raw_fields["CRT_MTH_NM"],
            research_date=raw_fields["RESEARCH_YMD"],
            update_date=raw_fields["UPDATE_DATE"],
            raw_fields=raw_fields,
        )

    @property
    def display_maker_name(self) -> str | None:
        return (
            self.maker_name
            or self.seller_manufacturer_name
            or self.import_manufacturer_name
        )


@dataclass(frozen=True)
class KfindFoodSearchResult:
    record: FoodSearchRecord
    metadata: KfindFoodMetadata


@dataclass(frozen=True)
class KfindFetchWindowMetadata:
    upstream_page: int
    upstream_page_size: int
    fetch_multiplier: int
    max_fetch_size: int
    raw_item_count: int
    ranked_candidate_count: int


@dataclass(frozen=True)
class KfindFoodSearchResponse:
    candidates: list[KfindFoodSearchResult]
    page: int
    page_size: int
    upstream_total_count: int | None
    has_more: bool
    fetch_window: KfindFetchWindowMetadata | None = None

    @property
    def items(self) -> list[FoodSearchRecord]:
        return [candidate.record for candidate in self.candidates]

    @property
    def returned_count(self) -> int:
        return len(self.candidates)

    @property
    def total_count(self) -> int | None:
        return self.upstream_total_count


class KfindClient:
    def __init__(
        self,
        config: KfindProviderConfig,
        *,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._config = config
        self._http_client = http_client or httpx.AsyncClient(timeout=config.timeout_seconds)
        self._owns_http_client = http_client is None

    async def aclose(self) -> None:
        if self._owns_http_client:
            await self._http_client.aclose()

    async def get_json(
        self,
        params: dict[str, str | int],
        *,
        operation: str = "search",
    ) -> JsonObject:
        url = self.build_request_url(params)

        try:
            response = await self._http_client.get(
                url,
                headers={"Accept": "application/json"},
                timeout=self._config.timeout_seconds,
            )
        except httpx.TimeoutException:
            raise KfindTimeoutError(
                provider_error_type=KFIND_CATEGORY_TIMEOUT,
                operation=operation,
            ) from None
        except httpx.RequestError:
            raise KfindUnavailableError(
                provider_error_type=KFIND_CATEGORY_UNAVAILABLE,
                operation=operation,
            ) from None

        _raise_for_http_status(response, operation=operation)

        try:
            payload = response.json()
        except ValueError:
            raise KfindInvalidResponseError(
                provider_error_type=KFIND_CATEGORY_MALFORMED_RESPONSE,
                operation=operation,
            ) from None

        if not isinstance(payload, dict):
            raise KfindInvalidResponseError(
                provider_error_type=KFIND_CATEGORY_MALFORMED_RESPONSE,
                operation=operation,
            )

        return payload

    def build_request_url(self, params: dict[str, str | int]) -> httpx.URL:
        encoded_params = str(httpx.QueryParams(params))
        service_key_query = f"serviceKey={self._config.service_key_encoded}"
        raw_query = (
            f"{encoded_params}&{service_key_query}"
            if encoded_params != ""
            else service_key_query
        )

        return httpx.URL(_build_endpoint_url(self._config.base_url)).copy_with(
            query=raw_query.encode("ascii"),
        )


class KfindFoodProvider:
    def __init__(
        self,
        config: KfindProviderConfig,
        client: KfindClient | None = None,
        *,
        fetch_window_policy: KfindFetchWindowPolicy | None = None,
    ) -> None:
        self._config = config
        self._client = client or KfindClient(config)
        self._fetch_window_policy = fetch_window_policy or KfindFetchWindowPolicy()

    async def aclose(self) -> None:
        await self._client.aclose()

    @property
    def provider_name(self) -> ProviderName:
        return KFIND_DATA_SOURCE

    async def check_auth(self) -> None:
        payload = await self._client.get_json(
            {
                "type": "json",
                "pageNo": 1,
                "numOfRows": 1,
                "FOOD_NM_KR": KFIND_AUTH_CHECK_QUERY,
            },
            operation="auth_check",
        )
        _validate_success_header(payload, operation="auth_check")

    async def search_foods(
        self,
        query: str,
        page: int = 1,
        page_size: int = 10,
    ) -> KfindFoodSearchResponse:
        normalized_query = query.strip()
        normalized_page = max(page, 1)
        normalized_page_size = min(max(page_size, MIN_PAGE_SIZE), MAX_PAGE_SIZE)

        if normalized_query == "":
            return KfindFoodSearchResponse(
                candidates=[],
                page=normalized_page,
                page_size=normalized_page_size,
                upstream_total_count=0,
                has_more=False,
            )

        fetch_size = self._fetch_window_policy.fetch_size(
            page_size=normalized_page_size,
        )
        payload = await self._client.get_json(
            {
                "type": "json",
                "pageNo": KFIND_UPSTREAM_PAGE_FOR_RANKING,
                "numOfRows": fetch_size,
                "FOOD_NM_KR": normalized_query,
            },
            operation="search",
        )

        return _search_response_from_payload(
            payload,
            query=normalized_query,
            page=normalized_page,
            page_size=normalized_page_size,
            fetch_size=fetch_size,
            fetch_window_policy=self._fetch_window_policy,
        )


def mask_service_key(value: str | None) -> str:
    if value is None or value.strip() == "":
        return ""

    return "***"


def kfind_error_metadata(error: FoodProviderError) -> KfindProviderErrorMetadata:
    return KfindProviderErrorMetadata(
        provider=KFIND_DATA_SOURCE,
        category=_category_from_error(error),
        upstream_code=error.provider_error_code,
        operation=error.operation,
    )


def parse_serving_size(value: Any) -> tuple[float | None, str | None]:
    normalized_value = _parse_optional_string(value)

    if normalized_value is None:
        return None, None

    match = SERVING_SIZE_PATTERN.match(normalized_value)

    if match is None:
        return None, None

    amount = _parse_positive_number(match.group("amount"))
    unit = match.group("unit").strip()

    if amount is None or unit == "":
        return None, None

    return amount, unit.casefold()


def display_name_from_source_food_name(source_food_name: str) -> str | None:
    if "_" not in source_food_name:
        return None

    return " - ".join(part.strip() for part in source_food_name.split("_"))


def _search_response_from_payload(
    payload: JsonObject,
    *,
    query: str,
    page: int,
    page_size: int,
    fetch_size: int,
    fetch_window_policy: KfindFetchWindowPolicy,
) -> KfindFoodSearchResponse:
    _validate_success_header(payload, operation="search")
    body = payload.get("body")

    if not isinstance(body, dict):
        raise KfindInvalidResponseError(
            provider_error_type=KFIND_CATEGORY_MALFORMED_RESPONSE,
            operation="search",
        )

    item_payloads = _extract_items(body.get("items"))
    candidates = [
        result
        for item_payload in item_payloads
        if (result := _search_result_from_item(item_payload)) is not None
    ]
    ranked_window_candidates = rank_kfind_results(query, candidates)
    start_index = (page - 1) * page_size
    end_index = start_index + page_size
    page_candidates = ranked_window_candidates[start_index:end_index]
    upstream_total_count = _parse_non_negative_int(body.get("totalCount"))
    has_more = _has_more_kfind_results(
        page=page,
        page_size=page_size,
        ranked_candidate_count=len(ranked_window_candidates),
    )

    return KfindFoodSearchResponse(
        candidates=page_candidates,
        page=page,
        page_size=page_size,
        upstream_total_count=upstream_total_count,
        has_more=has_more,
        fetch_window=KfindFetchWindowMetadata(
            upstream_page=KFIND_UPSTREAM_PAGE_FOR_RANKING,
            upstream_page_size=fetch_size,
            fetch_multiplier=fetch_window_policy.fetch_multiplier,
            max_fetch_size=fetch_window_policy.effective_max_fetch_size,
            raw_item_count=len(item_payloads),
            ranked_candidate_count=len(ranked_window_candidates),
        ),
    )


def _has_more_kfind_results(
    *,
    page: int,
    page_size: int,
    ranked_candidate_count: int,
) -> bool:
    end_index = page * page_size

    return end_index < ranked_candidate_count


def _validate_success_header(payload: JsonObject, *, operation: str) -> None:
    header = payload.get("header")

    if not isinstance(header, dict):
        raise KfindInvalidResponseError(
            provider_error_type=KFIND_CATEGORY_MALFORMED_RESPONSE,
            operation=operation,
        )

    result_code = _parse_optional_string(header.get("resultCode"))
    result_message = _parse_optional_string(header.get("resultMsg"))

    if result_code != "00":
        _raise_for_result_code(result_code, result_message, operation=operation)


def _search_result_from_item(item: Any) -> KfindFoodSearchResult | None:
    if not isinstance(item, dict):
        return None

    food_id = _parse_optional_string(item.get("FOOD_CD"))
    source_food_name = _parse_optional_string(item.get("FOOD_NM_KR"))

    if food_id is None or source_food_name is None:
        return None

    metadata = KfindFoodMetadata.from_item(item)
    serving_size, serving_unit = parse_serving_size(metadata.serving_size_raw)
    source_name = metadata.source_name or KFIND_DEFAULT_SOURCE_NAME

    record = FoodSearchRecord(
        id=_build_food_id(food_id),
        data_source=KFIND_DATA_SOURCE,
        source_food_id=food_id,
        source_food_name=source_food_name,
        source_serving_id=None,
        name=source_food_name,
        display_name=display_name_from_source_food_name(source_food_name),
        brand_name=metadata.display_maker_name,
        category=_join_non_empty(
            (
                metadata.food_category1_name,
                metadata.food_category2_name,
                metadata.food_reference_name,
            ),
            separator=" > ",
        ),
        serving_description=metadata.serving_size_raw,
        serving_size=serving_size,
        serving_unit=serving_unit,
        calories_kcal=_parse_non_negative_number(item.get("AMT_NUM1")),
        protein_g=_parse_non_negative_number(item.get("AMT_NUM3")),
        carbs_g=_parse_non_negative_number(item.get("AMT_NUM6")),
        fat_g=_parse_non_negative_number(item.get("AMT_NUM4")),
        source_region=KFIND_SOURCE_REGION,
        nutrition_source=NutritionSourceMetadata(
            type="mfds",
            name=source_name,
            record_id=food_id,
            checked_at=_checked_at_from_metadata(metadata),
        ),
        keywords=tuple(
            value
            for value in (
                metadata.db_group_name,
                metadata.db_class_name,
                metadata.food_origin_name,
                metadata.food_category1_name,
                metadata.food_category2_name,
                metadata.food_reference_name,
                metadata.display_maker_name,
            )
            if value is not None
        ),
    )

    return KfindFoodSearchResult(record=record, metadata=metadata)


def _extract_items(value: Any) -> list[Any]:
    if value is None:
        return []

    if isinstance(value, list):
        return value

    if isinstance(value, dict):
        if "item" in value:
            return _as_list(value.get("item"))

        return [value]

    raise KfindInvalidResponseError(
        provider_error_type=KFIND_CATEGORY_MALFORMED_RESPONSE,
        operation="search",
    )


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []

    if isinstance(value, list):
        return value

    return [value]


def _raise_for_result_code(
    result_code: str | None,
    result_message: str | None,
    *,
    operation: str,
) -> None:
    if result_code is None:
        raise KfindInvalidResponseError(
            provider_error_type=KFIND_CATEGORY_MALFORMED_RESPONSE,
            operation=operation,
        )

    category = _classify_result_error(result_code, result_message)
    kwargs = {
        "provider_error_code": result_code,
        "provider_error_type": category,
        "operation": operation,
    }

    if category == KFIND_CATEGORY_AUTH:
        raise KfindAuthenticationError(**kwargs)

    if category == KFIND_CATEGORY_PERMISSION:
        raise KfindPermissionError(**kwargs)

    if category == KFIND_CATEGORY_RATE_LIMIT:
        raise KfindRateLimitError(**kwargs)

    if category == KFIND_CATEGORY_TIMEOUT:
        raise KfindTimeoutError(**kwargs)

    raise KfindUnavailableError(**kwargs)


def _classify_result_error(result_code: str, result_message: str | None) -> KfindErrorCategory:
    normalized_message = result_message.casefold() if result_message is not None else ""

    if result_code in {"30", "31"}:
        return KFIND_CATEGORY_AUTH

    if result_code == "20":
        if any(keyword in normalized_message for keyword in ("service_key", "key", "auth")):
            return KFIND_CATEGORY_AUTH

        return KFIND_CATEGORY_PERMISSION

    if result_code in {"22", "23"}:
        return KFIND_CATEGORY_RATE_LIMIT

    if result_code == "05":
        return KFIND_CATEGORY_TIMEOUT

    if result_code == "29":
        return KFIND_CATEGORY_PERMISSION

    return KFIND_CATEGORY_UNAVAILABLE


def _raise_for_http_status(response: httpx.Response, *, operation: str) -> None:
    status_code = response.status_code

    if 200 <= status_code < 300:
        return

    if status_code == 401:
        raise KfindAuthenticationError(
            provider_error_code="http_401",
            provider_error_type=KFIND_CATEGORY_AUTH,
            operation=operation,
        )

    if status_code == 403:
        raise KfindPermissionError(
            provider_error_code="http_403",
            provider_error_type=KFIND_CATEGORY_PERMISSION,
            operation=operation,
        )

    if status_code == 429:
        raise KfindRateLimitError(
            provider_error_code="http_429",
            provider_error_type=KFIND_CATEGORY_RATE_LIMIT,
            operation=operation,
        )

    if status_code in {408, 504}:
        raise KfindTimeoutError(
            provider_error_code=f"http_{status_code}",
            provider_error_type=KFIND_CATEGORY_TIMEOUT,
            operation=operation,
        )

    if status_code >= 500:
        raise KfindUnavailableError(
            provider_error_code=f"http_{status_code}",
            provider_error_type=KFIND_CATEGORY_UNAVAILABLE,
            operation=operation,
        )

    raise KfindUnavailableError(
        provider_error_code=f"http_{status_code}",
        provider_error_type=KFIND_CATEGORY_UNAVAILABLE,
        operation=operation,
    )


def _category_from_error(error: FoodProviderError) -> KfindErrorCategory:
    if isinstance(error.provider_error_type, str) and error.provider_error_type in KFIND_ERROR_CATEGORIES:
        return error.provider_error_type  # type: ignore[return-value]

    if isinstance(error, KfindAuthenticationError):
        return KFIND_CATEGORY_AUTH

    if isinstance(error, KfindPermissionError):
        return KFIND_CATEGORY_PERMISSION

    if isinstance(error, KfindRateLimitError):
        return KFIND_CATEGORY_RATE_LIMIT

    if isinstance(error, KfindTimeoutError):
        return KFIND_CATEGORY_TIMEOUT

    if isinstance(error, KfindInvalidResponseError):
        return KFIND_CATEGORY_MALFORMED_RESPONSE

    return KFIND_CATEGORY_UNAVAILABLE


def _normalize_required_secret(value: str | None, environment_name: str) -> str:
    if not isinstance(value, str) or value.strip() == "":
        raise KfindConfigurationError(
            f"K-FIND diagnostic requires {environment_name}.",
        )

    if not _is_valid_encoded_query_value(value):
        raise KfindConfigurationError(
            f"{environment_name} is not a valid encoded query value.",
        )

    return value


def _is_valid_encoded_query_value(value: str) -> bool:
    index = 0

    while index < len(value):
        char = value[index]
        code_point = ord(char)

        if code_point <= 0x20 or code_point == 0x7F or code_point > 0x7E:
            return False

        if char in {"&", "=", "#"}:
            return False

        if char == "%":
            if index + 2 >= len(value):
                return False

            if not (_is_hex_digit(value[index + 1]) and _is_hex_digit(value[index + 2])):
                return False

            index += 3
            continue

        index += 1

    return True


def _is_hex_digit(value: str) -> bool:
    return "0" <= value <= "9" or "a" <= value.casefold() <= "f"


def _normalize_base_url(value: str | None) -> str:
    normalized_value = value.strip() if isinstance(value, str) else ""

    if normalized_value == "":
        raise KfindConfigurationError("KFOOD_BASE_URL must not be empty.")

    return normalized_value.rstrip("/")


def _build_endpoint_url(base_url: str) -> str:
    normalized_base_url = base_url.rstrip("/")

    if normalized_base_url.endswith(f"/{KFIND_SEARCH_ENDPOINT}"):
        return normalized_base_url

    return f"{normalized_base_url}/{KFIND_SEARCH_ENDPOINT}"


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

    normalized_value = value.strip().replace(",", "")

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


def _join_non_empty(values: tuple[str | None, ...], *, separator: str) -> str | None:
    parts = []

    for value in values:
        if value is not None and value not in parts:
            parts.append(value)

    return separator.join(parts) if len(parts) > 0 else None


def _checked_at_from_metadata(metadata: KfindFoodMetadata) -> str:
    return (
        _normalize_date_for_metadata(metadata.update_date)
        or _normalize_date_for_metadata(metadata.research_date)
        or "unknown"
    )


def _normalize_date_for_metadata(value: str | None) -> str | None:
    if value is None:
        return None

    normalized_value = value.strip()

    if re.fullmatch(r"\d{8}", normalized_value):
        return f"{normalized_value[0:4]}-{normalized_value[4:6]}-{normalized_value[6:8]}"

    return normalized_value or None


def _build_food_id(food_id: str) -> str:
    return f"kfind-{food_id}"
