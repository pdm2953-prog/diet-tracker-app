import asyncio
from collections.abc import Awaitable, Callable

import httpx
import pytest

import scripts.inspect_kfood_api as inspect_script
from app.core.config import Settings
from app.providers.errors import (
    KfindAuthenticationError,
    KfindConfigurationError,
    KfindInvalidResponseError,
    KfindPermissionError,
    KfindRateLimitError,
    KfindTimeoutError,
    KfindUnavailableError,
)
from app.providers.kfind import (
    CORE_NUTRIENT_FIELD_LABELS,
    CORE_NUTRIENT_FIELDS,
    KFIND_CATEGORY_AUTH,
    KFIND_CATEGORY_MALFORMED_RESPONSE,
    KFIND_CATEGORY_PERMISSION,
    KFIND_CATEGORY_RATE_LIMIT,
    KFIND_CATEGORY_TIMEOUT,
    KFIND_CATEGORY_UNAVAILABLE,
    KFIND_DATA_SOURCE,
    KfindClient,
    KfindFoodProvider,
    KfindProviderConfig,
    display_name_from_source_food_name,
    kfind_error_metadata,
    mask_service_key,
    parse_serving_size,
)


ENCODED_SERVICE_KEY = "encoded%2Bservice%2Fkey%3D"
FAKE_SECRET_SERVICE_KEY = "secret%2Bencoded%3D"


def run(coro: Awaitable[object]) -> object:
    return asyncio.run(coro)


def make_config(*, service_key: str = ENCODED_SERVICE_KEY) -> KfindProviderConfig:
    return KfindProviderConfig(
        service_key_encoded=service_key,
        base_url="https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02",
        timeout_seconds=1,
    )


def make_settings(*, service_key: str | None) -> Settings:
    return Settings(
        _env_file=None,
        KFOOD_API_KEY_ENCODED=service_key,
        KFOOD_BASE_URL="https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02",
        KFOOD_TIMEOUT_SECONDS=1,
    )


def make_provider(
    handler: Callable[[httpx.Request], httpx.Response | Awaitable[httpx.Response]],
    *,
    config: KfindProviderConfig | None = None,
) -> KfindFoodProvider:
    resolved_config = config or make_config()
    http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client = KfindClient(resolved_config, http_client=http_client)

    return KfindFoodProvider(resolved_config, client)


def normal_payload(
    items: object,
    *,
    total_count: str = "1",
) -> dict[str, object]:
    return {
        "header": {
            "resultCode": "00",
            "resultMsg": "NORMAL SERVICE.",
        },
        "body": {
            "pageNo": "1",
            "totalCount": total_count,
            "numOfRows": "10",
            "items": items,
        },
    }


def error_payload(result_code: str, result_message: str) -> dict[str, object]:
    return {
        "header": {
            "resultCode": result_code,
            "resultMsg": result_message,
        },
        "body": {},
    }


def kfind_item(
    *,
    food_code: str = "D000001",
    food_name: str = "된장찌개_우렁",
    serving_size: str | None = "100g",
    calories: str | None = "46.00",
    water: str | None = "89.30",
    protein: str | None = "3.38",
    fat: str | None = "1.63",
    ash: str | None = "1.28",
    carbohydrate: str | None = "4.44",
    maker_name: str | None = "테스트업체",
) -> dict[str, str]:
    item: dict[str, str] = {
        "FOOD_CD": food_code,
        "FOOD_NM_KR": food_name,
        "DB_GRP_NM": "음식",
        "DB_CLASS_NM": "품목대표",
        "FOOD_OR_NM": "외식",
        "FOOD_CAT1_NM": "음식",
        "FOOD_REF_NM": "된장찌개",
        "FOOD_CAT2_NM": "찌개 및 전골류",
        "SUB_REF_NAME": "식품의약품안전처",
        "DISH_ONE_SERVING": "1대접",
        "Z10500": "250g",
        "IMP_MANUFAC_NM": "수입업체",
        "SELLER_MANUFAC_NM": "유통업체",
        "CRT_MTH_NM": "분석",
        "RESEARCH_YMD": "20240102",
        "UPDATE_DATE": "20250203",
    }
    optional_fields = {
        "SERVING_SIZE": serving_size,
        "AMT_NUM1": calories,
        "AMT_NUM2": water,
        "AMT_NUM3": protein,
        "AMT_NUM4": fat,
        "AMT_NUM5": ash,
        "AMT_NUM6": carbohydrate,
        "MAKER_NM": maker_name,
    }

    for key, value in optional_fields.items():
        if value is not None:
            item[key] = value

    return item


def raw_query(request: httpx.Request) -> str:
    query = request.url.query

    return query.decode("ascii") if isinstance(query, bytes) else query


def assert_error_metadata(
    error: Exception,
    *,
    category: str,
    upstream_code: str | None,
    operation: str,
) -> None:
    assert isinstance(error, KfindAuthenticationError | KfindInvalidResponseError |
        KfindPermissionError | KfindRateLimitError | KfindTimeoutError |
        KfindUnavailableError)
    metadata = kfind_error_metadata(error)

    assert metadata.provider == KFIND_DATA_SOURCE
    assert metadata.category == category
    assert metadata.upstream_code == upstream_code
    assert metadata.operation == operation


def run_provider_operation(provider: KfindFoodProvider, operation: str) -> object:
    if operation == "auth_check":
        return run(provider.check_auth())

    return run(provider.search_foods("된장찌개", page=1, page_size=10))


def test_search_uses_food_name_param_and_does_not_double_encode_service_key() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=normal_payload([kfind_item()]))

    provider = make_provider(handler)
    response = run(provider.search_foods("된장찌개", page=1, page_size=10))

    assert len(requests) == 1
    request = requests[0]
    query = raw_query(request)
    assert str(request.url).startswith(
        "https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02?"
    )
    assert "serviceKey=encoded%2Bservice%2Fkey%3D" in query
    assert "encoded%252Bservice" not in query
    assert request.url.params["FOOD_NM_KR"] == "된장찌개"
    assert request.url.params["type"] == "json"
    assert request.url.params["pageNo"] == "1"
    assert request.url.params["numOfRows"] == "10"

    candidate = response.candidates[0]  # type: ignore[attr-defined]
    record = candidate.record
    metadata = candidate.metadata
    assert record.id == "kfind-D000001"
    assert record.data_source == "kfind"
    assert record.source_food_id == "D000001"
    assert record.source_food_name == "된장찌개_우렁"
    assert record.name == "된장찌개_우렁"
    assert record.display_name == "된장찌개 - 우렁"
    assert record.brand_name == "테스트업체"
    assert record.serving_size == 100
    assert record.serving_unit == "g"
    assert record.serving_description == "100g"
    assert record.calories_kcal == 46
    assert record.protein_g == 3.38
    assert record.carbs_g == 4.44
    assert record.fat_g == 1.63
    assert record.source_region == "KR"
    assert record.nutrition_source is not None
    assert record.nutrition_source.type == "mfds"
    assert record.nutrition_source.name == "식품의약품안전처"
    assert record.nutrition_source.record_id == "D000001"
    assert record.nutrition_source.checked_at == "2025-02-03"
    assert metadata.food_weight == "250g"
    assert metadata.creation_method_name == "분석"
    assert metadata.research_date == "20240102"
    assert metadata.update_date == "20250203"
    assert metadata.raw_fields["Z10500"] == "250g"


@pytest.mark.parametrize(
    "service_key",
    [
        "plainSafeASCII-._~123",
        "abc%2Fdef",
        "abc%3D",
        "abc%2Fdef%3Dxyz%2B",
    ],
)
def test_encoded_service_key_validation_accepts_safe_query_values(service_key: str) -> None:
    config = KfindProviderConfig.from_settings(make_settings(service_key=service_key))

    assert config.service_key_encoded == service_key


@pytest.mark.parametrize(
    "service_key",
    [
        "abc&foo=bar",
        "abc=def",
        "abc#def",
        "abc def",
        "abc\tdef",
        "abc\ndef",
        "abc\x1fdef",
        "abc%",
        "abc%2",
        "abc%GG",
    ],
)
def test_encoded_service_key_validation_rejects_unsafe_values_without_leaking_secret(
    service_key: str,
    caplog: pytest.LogCaptureFixture,
) -> None:
    with pytest.raises(KfindConfigurationError) as exc_info:
        KfindProviderConfig.from_settings(make_settings(service_key=service_key))

    assert str(exc_info.value) == "KFOOD_API_KEY_ENCODED is not a valid encoded query value."
    assert service_key not in str(exc_info.value)
    assert service_key not in repr(exc_info.value)
    assert service_key not in caplog.text


def test_check_auth_uses_minimal_read_only_request_and_result_code_00_is_ok() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=normal_payload([kfind_item()]))

    provider = make_provider(handler)

    assert run(provider.check_auth()) is None
    assert len(requests) == 1
    assert requests[0].url.params["type"] == "json"
    assert requests[0].url.params["pageNo"] == "1"
    assert requests[0].url.params["numOfRows"] == "1"
    assert requests[0].url.params["FOOD_NM_KR"] == "된장찌개"


def test_official_core_nutrient_mapping_is_explicit() -> None:
    assert CORE_NUTRIENT_FIELDS == {
        "calories_kcal": "AMT_NUM1",
        "protein_g": "AMT_NUM3",
        "fat_g": "AMT_NUM4",
        "carbs_g": "AMT_NUM6",
    }
    assert CORE_NUTRIENT_FIELD_LABELS["AMT_NUM1"] == "에너지(kcal)"
    assert CORE_NUTRIENT_FIELD_LABELS["AMT_NUM2"] == "수분(g)"
    assert CORE_NUTRIENT_FIELD_LABELS["AMT_NUM3"] == "단백질(g)"
    assert CORE_NUTRIENT_FIELD_LABELS["AMT_NUM4"] == "지방(g)"
    assert CORE_NUTRIENT_FIELD_LABELS["AMT_NUM5"] == "회분(g)"
    assert CORE_NUTRIENT_FIELD_LABELS["AMT_NUM6"] == "탄수화물(g)"


def test_multiple_korean_food_variants_preserve_source_name_and_only_normalize_display() -> None:
    items = [
        kfind_item(food_code="D1", food_name="된장찌개"),
        kfind_item(food_code="D2", food_name="된장찌개_우렁"),
        kfind_item(food_code="D3", food_name="된장찌개_냉이"),
        kfind_item(food_code="D4", food_name="된장찌개_1"),
    ]

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=normal_payload(items, total_count="4"))

    provider = make_provider(handler)
    response = run(provider.search_foods("된장찌개", page=1, page_size=10))
    records = [candidate.record for candidate in response.candidates]  # type: ignore[attr-defined]

    assert [record.source_food_name for record in records] == [
        "된장찌개",
        "된장찌개_우렁",
        "된장찌개_냉이",
        "된장찌개_1",
    ]
    assert [record.display_name for record in records] == [
        None,
        "된장찌개 - 우렁",
        "된장찌개 - 냉이",
        "된장찌개 - 1",
    ]
    assert display_name_from_source_food_name("된장찌개_두부") == "된장찌개 - 두부"


def test_empty_result_is_safe() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=normal_payload([], total_count="0"))

    provider = make_provider(handler)
    response = run(provider.search_foods("없는음식", page=1, page_size=10))

    assert response.candidates == []  # type: ignore[attr-defined]
    assert response.total_count == 0  # type: ignore[attr-defined]
    assert response.has_more is False  # type: ignore[attr-defined]


def test_missing_items_is_treated_as_empty_result() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        payload = normal_payload([], total_count="0")
        body = payload["body"]
        assert isinstance(body, dict)
        body.pop("items")
        return httpx.Response(200, json=payload)

    provider = make_provider(handler)
    response = run(provider.search_foods("없는음식", page=1, page_size=10))

    assert response.candidates == []  # type: ignore[attr-defined]


def test_malformed_items_are_skipped_without_failing_entire_response() -> None:
    items = [
        None,
        "not an object",
        {"FOOD_CD": "", "FOOD_NM_KR": "식품명없음"},
        {"FOOD_CD": "D0"},
        kfind_item(food_code="D1", food_name="된장찌개"),
    ]

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=normal_payload(items, total_count="5"))

    provider = make_provider(handler)
    response = run(provider.search_foods("된장찌개", page=1, page_size=10))

    assert [candidate.record.source_food_id for candidate in response.candidates] == ["D1"]  # type: ignore[attr-defined]


def test_missing_nutrient_maps_only_missing_value_to_none() -> None:
    item = kfind_item(protein=None)

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=normal_payload([item]))

    provider = make_provider(handler)
    response = run(provider.search_foods("된장찌개", page=1, page_size=10))
    record = response.candidates[0].record  # type: ignore[attr-defined]

    assert record.calories_kcal == 46
    assert record.protein_g is None
    assert record.carbs_g == 4.44
    assert record.fat_g == 1.63


def test_malformed_serving_size_does_not_infer_unit_conversion() -> None:
    item = kfind_item(serving_size="about 100 grams")

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=normal_payload([item]))

    provider = make_provider(handler)
    response = run(provider.search_foods("된장찌개", page=1, page_size=10))
    record = response.candidates[0].record  # type: ignore[attr-defined]

    assert record.serving_description == "about 100 grams"
    assert record.serving_size is None
    assert record.serving_unit is None
    assert parse_serving_size(" 100.5g ") == (100.5, "g")
    assert parse_serving_size("100ml") == (100, "ml")


def test_result_code_30_authentication_error_does_not_include_service_key() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json=error_payload("30", "SERVICE_KEY_IS_NOT_REGISTERED_ERROR"),
        )

    config = make_config(service_key=FAKE_SECRET_SERVICE_KEY)
    provider = make_provider(handler, config=config)

    with pytest.raises(KfindAuthenticationError) as exc_info:
        run(provider.search_foods("된장찌개", page=1, page_size=10))

    assert_error_metadata(
        exc_info.value,
        category=KFIND_CATEGORY_AUTH,
        upstream_code="30",
        operation="search",
    )
    assert FAKE_SECRET_SERVICE_KEY not in str(exc_info.value)
    assert FAKE_SECRET_SERVICE_KEY not in repr(config)
    assert FAKE_SECRET_SERVICE_KEY not in repr(kfind_error_metadata(exc_info.value))
    assert mask_service_key(config.service_key_encoded) == "***"


def test_result_code_30_check_auth_uses_auth_category() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json=error_payload("30", "SERVICE_KEY_IS_NOT_REGISTERED_ERROR"),
        )

    provider = make_provider(handler)

    with pytest.raises(KfindAuthenticationError) as exc_info:
        run(provider.check_auth())

    assert_error_metadata(
        exc_info.value,
        category=KFIND_CATEGORY_AUTH,
        upstream_code="30",
        operation="auth_check",
    )


@pytest.mark.parametrize(
    ("provider_operation", "expected_operation"),
    [
        ("auth_check", "auth_check"),
        ("search", "search"),
    ],
)
@pytest.mark.parametrize(
    ("status_code", "expected_error", "category", "upstream_code"),
    [
        (401, KfindAuthenticationError, KFIND_CATEGORY_AUTH, "http_401"),
        (403, KfindPermissionError, KFIND_CATEGORY_PERMISSION, "http_403"),
        (429, KfindRateLimitError, KFIND_CATEGORY_RATE_LIMIT, "http_429"),
        (500, KfindUnavailableError, KFIND_CATEGORY_UNAVAILABLE, "http_500"),
    ],
)
def test_http_status_errors_preserve_operation_metadata(
    provider_operation: str,
    expected_operation: str,
    status_code: int,
    expected_error: type[Exception],
    category: str,
    upstream_code: str,
) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, json={"error": "upstream"})

    provider = make_provider(handler)

    with pytest.raises(expected_error) as exc_info:
        run_provider_operation(provider, provider_operation)

    assert_error_metadata(
        exc_info.value,
        category=category,
        upstream_code=upstream_code,
        operation=expected_operation,
    )


@pytest.mark.parametrize(
    ("provider_operation", "expected_operation"),
    [
        ("auth_check", "auth_check"),
        ("search", "search"),
    ],
)
@pytest.mark.parametrize(
    ("failure", "expected_error", "category"),
    [
        ("timeout", KfindTimeoutError, KFIND_CATEGORY_TIMEOUT),
        ("network", KfindUnavailableError, KFIND_CATEGORY_UNAVAILABLE),
    ],
)
def test_request_errors_preserve_operation_metadata(
    provider_operation: str,
    expected_operation: str,
    failure: str,
    expected_error: type[Exception],
    category: str,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if failure == "timeout":
            raise httpx.TimeoutException("timed out", request=request)

        raise httpx.ConnectError("network unavailable", request=request)

    provider = make_provider(handler)

    with pytest.raises(expected_error) as exc_info:
        run_provider_operation(provider, provider_operation)

    assert_error_metadata(
        exc_info.value,
        category=category,
        upstream_code=None,
        operation=expected_operation,
    )


def test_permission_error_uses_permission_category() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=error_payload("29", "SERVICE_ACCESS_DENIED_ERROR"))

    provider = make_provider(handler)

    with pytest.raises(KfindPermissionError) as exc_info:
        run(provider.search_foods("된장찌개", page=1, page_size=10))

    assert_error_metadata(
        exc_info.value,
        category=KFIND_CATEGORY_PERMISSION,
        upstream_code="29",
        operation="search",
    )


def test_result_code_rate_limit_error_is_classified() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json=error_payload("22", "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR"),
        )

    provider = make_provider(handler)

    with pytest.raises(KfindRateLimitError) as exc_info:
        run(provider.search_foods("된장찌개", page=1, page_size=10))

    assert_error_metadata(
        exc_info.value,
        category=KFIND_CATEGORY_RATE_LIMIT,
        upstream_code="22",
        operation="search",
    )


def test_timeout_is_classified() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("timed out", request=request)

    provider = make_provider(handler)

    with pytest.raises(KfindTimeoutError) as exc_info:
        run(provider.search_foods("된장찌개", page=1, page_size=10))

    assert_error_metadata(
        exc_info.value,
        category=KFIND_CATEGORY_TIMEOUT,
        upstream_code=None,
        operation="search",
    )
    assert ENCODED_SERVICE_KEY not in str(exc_info.value)


def test_unavailable_network_error_is_classified_without_credential_leak() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("network unavailable", request=request)

    config = make_config(service_key=FAKE_SECRET_SERVICE_KEY)
    provider = make_provider(handler, config=config)

    with pytest.raises(KfindUnavailableError) as exc_info:
        run(provider.search_foods("된장찌개", page=1, page_size=10))

    assert_error_metadata(
        exc_info.value,
        category=KFIND_CATEGORY_UNAVAILABLE,
        upstream_code=None,
        operation="search",
    )
    assert FAKE_SECRET_SERVICE_KEY not in str(exc_info.value)
    assert FAKE_SECRET_SERVICE_KEY not in repr(exc_info.value)


def test_malformed_upstream_response_is_classified() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"header": {"resultCode": "00"}})

    provider = make_provider(handler)

    with pytest.raises(KfindInvalidResponseError) as exc_info:
        run(provider.search_foods("된장찌개", page=1, page_size=10))

    assert_error_metadata(
        exc_info.value,
        category=KFIND_CATEGORY_MALFORMED_RESPONSE,
        upstream_code=None,
        operation="search",
    )


def test_unavailable_http_status_is_classified() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "upstream"})

    provider = make_provider(handler)

    with pytest.raises(KfindUnavailableError) as exc_info:
        run(provider.search_foods("된장찌개", page=1, page_size=10))

    assert_error_metadata(
        exc_info.value,
        category=KFIND_CATEGORY_UNAVAILABLE,
        upstream_code="http_500",
        operation="search",
    )


def test_check_auth_cli_success_path(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    class FakeProvider:
        def __init__(self, _config: KfindProviderConfig) -> None:
            pass

        async def check_auth(self) -> None:
            return None

        async def aclose(self) -> None:
            return None

    monkeypatch.setattr(inspect_script, "load_kfind_config", lambda: make_config())
    monkeypatch.setattr(inspect_script, "KfindFoodProvider", FakeProvider)

    exit_code = inspect_script.main(["--check-auth"])
    output = capsys.readouterr()

    assert exit_code == 0
    assert output.out == "K-FIND auth: OK\n"
    assert output.err == ""


def test_check_auth_cli_auth_failure_path_masks_service_key(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    class FakeProvider:
        def __init__(self, _config: KfindProviderConfig) -> None:
            pass

        async def check_auth(self) -> None:
            raise KfindAuthenticationError(
                provider_error_code="30",
                provider_error_type=KFIND_CATEGORY_AUTH,
                operation="auth_check",
            )

        async def aclose(self) -> None:
            return None

    monkeypatch.setattr(inspect_script, "load_kfind_config", lambda: make_config(
        service_key=FAKE_SECRET_SERVICE_KEY,
    ))
    monkeypatch.setattr(inspect_script, "KfindFoodProvider", FakeProvider)

    exit_code = inspect_script.main(["--check-auth"])
    output = capsys.readouterr()

    assert exit_code == 1
    assert "K-FIND auth: CHECK_REQUIRED" in output.out
    assert "hint: 공공데이터포털에서 활용기간과 인증키 상태를 확인하세요." in output.out
    assert FAKE_SECRET_SERVICE_KEY not in output.out
    assert "serviceKey" not in output.out
    assert output.err == ""


@pytest.mark.parametrize(
    ("error", "expected_output"),
    [
        (
            KfindTimeoutError(provider_error_type=KFIND_CATEGORY_TIMEOUT),
            "K-FIND status: TIMEOUT\n",
        ),
        (
            KfindUnavailableError(provider_error_type=KFIND_CATEGORY_UNAVAILABLE),
            "K-FIND status: UNAVAILABLE\n",
        ),
        (
            KfindRateLimitError(provider_error_type=KFIND_CATEGORY_RATE_LIMIT),
            "K-FIND status: RATE_LIMITED\n",
        ),
        (
            KfindPermissionError(provider_error_type=KFIND_CATEGORY_PERMISSION),
            "K-FIND status: PERMISSION_DENIED\n",
        ),
        (
            KfindInvalidResponseError(provider_error_type=KFIND_CATEGORY_MALFORMED_RESPONSE),
            "K-FIND status: MALFORMED_RESPONSE\n",
        ),
    ],
)
def test_check_auth_output_keeps_non_auth_statuses_distinct(
    error: Exception,
    expected_output: str,
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert isinstance(error, KfindTimeoutError | KfindUnavailableError | KfindRateLimitError |
        KfindPermissionError | KfindInvalidResponseError)

    inspect_script.print_auth_check_error(error, stream=inspect_script.sys.stdout)
    output = capsys.readouterr()

    assert output.out == expected_output
    assert output.err == ""


def test_search_diagnostic_auth_error_hint_masks_service_key(capsys: pytest.CaptureFixture[str]) -> None:
    error = KfindAuthenticationError(
        provider_error_code="30",
        provider_error_type=KFIND_CATEGORY_AUTH,
        operation="search",
    )

    inspect_script.print_provider_error(error, stream=inspect_script.sys.stderr)
    output = capsys.readouterr()

    assert "provider: kfind" in output.err
    assert "category: auth" in output.err
    assert "K-FIND 인증키가 만료·비활성 상태이거나" in output.err
    assert "서비스에 등록되지 않았을 수 있습니다" in output.err
    assert FAKE_SECRET_SERVICE_KEY not in output.err
    assert "serviceKey" not in output.err