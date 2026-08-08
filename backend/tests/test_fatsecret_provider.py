import asyncio
from collections.abc import Awaitable, Callable
from urllib.parse import parse_qs

import httpx
import pytest

from app.core.config import Settings
from app.providers.errors import (
    FatSecretAuthenticationError,
    FatSecretConfigurationError,
    FatSecretInvalidResponseError,
    FatSecretPermissionError,
    FatSecretRateLimitError,
    FatSecretTimeoutError,
    FatSecretUnavailableError,
)
from app.providers.fatsecret import (
    FATSECRET_API_ENDPOINT,
    FATSECRET_TOKEN_ENDPOINT,
    FatSecretClient,
    FatSecretFoodProvider,
    FatSecretProviderConfig,
)


CLIENT_ID = "test-client-id"
CLIENT_SECRET = "test-client-secret"
ACCESS_TOKEN = "test-access-token"


def run(coro: Awaitable[object]) -> object:
    return asyncio.run(coro)


def make_config(
    *,
    api_edition: str = "premier",
    region: str = "KR",
    language: str = "ko",
    token_refresh_margin_seconds: float = 60,
    timeout_seconds: float = 1,
    basic_max_results: int = 10,
    detail_concurrency: int = 4,
) -> FatSecretProviderConfig:
    return FatSecretProviderConfig(
        api_edition=api_edition,  # type: ignore[arg-type]
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        region=region,
        language=language,
        timeout_seconds=timeout_seconds,
        token_refresh_margin_seconds=token_refresh_margin_seconds,
        basic_max_results=basic_max_results,
        detail_concurrency=detail_concurrency,
    )


def token_response(token: str = ACCESS_TOKEN, expires_in: int | str = 3600) -> httpx.Response:
    return httpx.Response(200, json={"access_token": token, "expires_in": expires_in})


def serving_payload(
    *,
    serving_id: str = "serving-100",
    amount: str | None = "100.000",
    unit: str | None = "g",
    calories: str | None = "109",
    protein: str | None = "22.98",
    carbohydrate: str | None = "0",
    fat: str | None = "1.2",
    description: str = "100 g",
    is_default: str | None = None,
) -> dict[str, str]:
    serving: dict[str, str] = {
        "serving_id": serving_id,
        "serving_description": description,
    }

    optional_fields = {
        "metric_serving_amount": amount,
        "metric_serving_unit": unit,
        "calories": calories,
        "protein": protein,
        "carbohydrate": carbohydrate,
        "fat": fat,
        "is_default": is_default,
    }

    for key, value in optional_fields.items():
        if value is not None:
            serving[key] = value

    return serving


def food_payload(
    *,
    food_id: str = "123",
    food_name: str = "Chicken Breast",
    brand_name: str | None = None,
    servings: list[dict[str, str]] | None = None,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "food_id": food_id,
        "food_name": food_name,
    }

    if brand_name is not None:
        payload["brand_name"] = brand_name

    if servings is not None:
        payload["servings"] = {"serving": servings}

    return payload


def basic_search_payload(
    foods: list[dict[str, object]] | dict[str, object] | None = None,
    *,
    total_results: str = "1",
) -> dict[str, object]:
    foods_body: dict[str, object] = {
        "max_results": "20",
        "page_number": "0",
        "total_results": total_results,
    }

    if foods is not None:
        foods_body["food"] = foods

    return {"foods": foods_body}


def premier_search_payload(
    foods: list[dict[str, object]] | dict[str, object] | None = None,
    *,
    total_results: str = "1",
    include_results: bool = True,
) -> dict[str, object]:
    foods_search_body: dict[str, object] = {
        "max_results": "20",
        "page_number": "0",
        "total_results": total_results,
    }

    if include_results:
        results_body: dict[str, object] = {}

        if foods is not None:
            results_body["food"] = foods

        foods_search_body["results"] = results_body

    return {"foods_search": foods_search_body}


def make_provider(
    handler: Callable[[httpx.Request], httpx.Response | Awaitable[httpx.Response]],
    *,
    config: FatSecretProviderConfig | None = None,
    clock: Callable[[], float] | None = None,
) -> FatSecretFoodProvider:
    resolved_config = config or make_config()
    http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client = FatSecretClient(
        resolved_config,
        clock=clock or (lambda: 0),
        http_client=http_client,
    )

    return FatSecretFoodProvider(resolved_config, client)


def request_params(request: httpx.Request) -> dict[str, str]:
    return dict(request.url.params)


def test_oauth_token_issue_parses_access_token_and_expiration() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return token_response(expires_in="120")

    async def scenario() -> str:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
            client = FatSecretClient(
                make_config(api_edition="basic", region="US", language="en"),
                clock=lambda: 0,
                http_client=http_client,
            )

            return await client.get_access_token()

    token = run(scenario())

    assert token == ACCESS_TOKEN
    assert len(requests) == 1
    assert requests[0].method == "POST"
    assert str(requests[0].url) == FATSECRET_TOKEN_ENDPOINT
    assert parse_qs(requests[0].content.decode()) == {
        "grant_type": ["client_credentials"],
        "scope": ["basic"],
    }


def test_token_cache_reuses_valid_token() -> None:
    request_count = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal request_count
        request_count += 1
        return token_response(token=f"token-{request_count}")

    async def scenario() -> tuple[str, str]:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
            client = FatSecretClient(
                make_config(token_refresh_margin_seconds=60),
                clock=lambda: 0,
                http_client=http_client,
            )
            return await client.get_access_token(), await client.get_access_token()

    first_token, second_token = run(scenario())  # type: ignore[misc]

    assert first_token == "token-1"
    assert second_token == "token-1"
    assert request_count == 1


def test_token_refreshes_after_refresh_margin() -> None:
    request_count = 0
    now = 0.0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal request_count
        request_count += 1
        return token_response(token=f"token-{request_count}", expires_in=100)

    def clock() -> float:
        return now

    async def scenario() -> tuple[str, str, str]:
        nonlocal now
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
            client = FatSecretClient(
                make_config(token_refresh_margin_seconds=60),
                clock=clock,
                http_client=http_client,
            )
            first = await client.get_access_token()
            now = 39
            second = await client.get_access_token()
            now = 41
            third = await client.get_access_token()
            return first, second, third

    first_token, second_token, third_token = run(scenario())  # type: ignore[misc]

    assert first_token == "token-1"
    assert second_token == "token-1"
    assert third_token == "token-2"
    assert request_count == 2


def test_concurrent_token_requests_issue_one_token() -> None:
    request_count = 0

    async def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal request_count
        request_count += 1
        await asyncio.sleep(0)
        return token_response(token="shared-token")

    async def scenario() -> list[str]:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
            client = FatSecretClient(
                make_config(),
                clock=lambda: 0,
                http_client=http_client,
            )
            return await asyncio.gather(*[client.get_access_token() for _ in range(5)])

    tokens = run(scenario())

    assert tokens == ["shared-token"] * 5
    assert request_count == 1

def test_secret_and_access_token_are_not_exposed_in_errors_or_logs(
    caplog: pytest.LogCaptureFixture,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.fatsecret.com":
            return token_response(token="private-access-token")

        return httpx.Response(200, content=b"not-json")

    async def scenario() -> None:
        provider = make_provider(handler)
        await provider.search_foods("chicken", 1, 20)

    with pytest.raises(FatSecretInvalidResponseError) as exc_info:
        run(scenario())

    error_text = str(exc_info.value)
    assert CLIENT_SECRET not in error_text
    assert "private-access-token" not in error_text
    assert CLIENT_SECRET not in caplog.text
    assert "private-access-token" not in caplog.text


def test_basic_provider_config_defaults_to_us_english_basic_scope() -> None:
    settings = Settings(
        _env_file=None,
        FOOD_PROVIDER="fatsecret",
        FATSECRET_CLIENT_ID=CLIENT_ID,
        FATSECRET_CLIENT_SECRET=CLIENT_SECRET,
    )

    config = FatSecretProviderConfig.from_settings(settings)

    assert config.api_edition == "basic"
    assert config.region == "US"
    assert config.language == "en"
    assert config.token_scope == "basic"
    assert config.search_method == "foods.search"
    assert config.get_method == "food.get.v2"


def test_basic_provider_rejects_kr_region_without_market_permission() -> None:
    settings = Settings(
        _env_file=None,
        FOOD_PROVIDER="fatsecret",
        FATSECRET_CLIENT_ID=CLIENT_ID,
        FATSECRET_CLIENT_SECRET=CLIENT_SECRET,
        FATSECRET_REGION="KR",
    )

    with pytest.raises(FatSecretConfigurationError) as exc_info:
        FatSecretProviderConfig.from_settings(settings)

    assert "FATSECRET_REGION=KR" in str(exc_info.value)
    assert "Premier Korean market access" in str(exc_info.value)


def test_basic_search_parses_v1_food_array_and_detail_fallback() -> None:
    api_methods: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.fatsecret.com":
            return token_response()

        params = request_params(request)
        api_methods.append(params["method"])

        if params["method"] == "foods.search":
            return httpx.Response(200, json=basic_search_payload([
                food_payload(food_id="1", food_name="Apple"),
                food_payload(food_id="2", food_name="Banana"),
            ], total_results="2"))

        food_id = params["food_id"]
        return httpx.Response(200, json={
            "food": food_payload(
                food_id=food_id,
                food_name=f"Food {food_id}",
                servings=[serving_payload(serving_id=f"serving-{food_id}")],
            ),
        })

    async def scenario():
        provider = make_provider(
            handler,
            config=make_config(api_edition="basic", region="US", language="en"),
        )
        return await provider.search_foods("fruit", 1, 10)

    result = run(scenario())

    assert [item.source_food_id for item in result.items] == ["1", "2"]
    assert [item.source_serving_id for item in result.items] == ["serving-1", "serving-2"]
    assert api_methods.count("foods.search") == 1
    assert api_methods.count("food.get.v2") == 2


def test_basic_search_parses_v1_single_food_object() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.fatsecret.com":
            return token_response()

        params = request_params(request)

        if params["method"] == "foods.search":
            return httpx.Response(200, json=basic_search_payload(
                food_payload(food_id="1", food_name="Apple"),
            ))

        return httpx.Response(200, json={
            "food": food_payload(
                food_id="1",
                food_name="Apple",
                servings=[serving_payload(serving_id="serving-1")],
            ),
        })

    async def scenario():
        provider = make_provider(
            handler,
            config=make_config(api_edition="basic", region="US", language="en"),
        )
        return await provider.search_foods("apple", 1, 10)

    result = run(scenario())

    assert len(result.items) == 1
    assert result.items[0].source_food_id == "1"
    assert result.items[0].source_food_name == "Apple"
    assert result.items[0].source_serving_id == "serving-1"


def test_basic_empty_search_missing_food_is_successful() -> None:
    api_methods: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.fatsecret.com":
            return token_response()

        params = request_params(request)
        api_methods.append(params["method"])
        return httpx.Response(200, json=basic_search_payload(None, total_results="0"))

    async def scenario():
        provider = make_provider(
            handler,
            config=make_config(api_edition="basic", region="US", language="en"),
        )
        return await provider.search_foods("missing", 1, 10)

    result = run(scenario())

    assert result.items == []
    assert result.has_more is False
    assert api_methods == ["foods.search"]


def test_basic_search_caps_page_size_to_configured_max_results() -> None:
    api_requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.fatsecret.com":
            return token_response()

        api_requests.append(request)
        return httpx.Response(200, json=basic_search_payload(None, total_results="0"))

    async def scenario():
        provider = make_provider(
            handler,
            config=make_config(
                api_edition="basic",
                region="US",
                language="en",
                basic_max_results=10,
            ),
        )
        return await provider.search_foods("chicken", 1, 11)

    result = run(scenario())

    assert result.page_size == 10
    assert request_params(api_requests[0])["max_results"] == "10"


def test_basic_max_results_setting_is_validated() -> None:
    settings = Settings(
        _env_file=None,
        FOOD_PROVIDER="fatsecret",
        FATSECRET_CLIENT_ID=CLIENT_ID,
        FATSECRET_CLIENT_SECRET=CLIENT_SECRET,
        FATSECRET_BASIC_MAX_RESULTS=11,
    )

    with pytest.raises(FatSecretConfigurationError) as exc_info:
        FatSecretProviderConfig.from_settings(settings)

    assert "FATSECRET_BASIC_MAX_RESULTS" in str(exc_info.value)


def test_basic_detail_fallback_uses_bounded_concurrency_and_preserves_order() -> None:
    active_details = 0
    max_active_details = 0
    detail_call_ids: list[str] = []
    food_ids = [str(index) for index in range(10)]

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal active_details, max_active_details

        if request.url.host == "oauth.fatsecret.com":
            return token_response()

        params = request_params(request)

        if params["method"] == "foods.search":
            return httpx.Response(200, json=basic_search_payload([
                food_payload(food_id=food_id, food_name=f"Food {food_id}")
                for food_id in food_ids
            ], total_results="10"))

        food_id = params["food_id"]
        detail_call_ids.append(food_id)
        active_details += 1
        max_active_details = max(max_active_details, active_details)
        await asyncio.sleep(0.01)
        active_details -= 1

        return httpx.Response(200, json={
            "food": food_payload(
                food_id=food_id,
                food_name=f"Food {food_id}",
                servings=[serving_payload(serving_id=f"serving-{food_id}")],
            ),
        })

    async def scenario():
        provider = make_provider(
            handler,
            config=make_config(
                api_edition="basic",
                region="US",
                language="en",
                detail_concurrency=3,
            ),
        )
        return await provider.search_foods("food", 1, 10)

    result = run(scenario())

    assert max_active_details <= 3
    assert sorted(detail_call_ids, key=int) == food_ids
    assert [item.source_food_id for item in result.items] == food_ids


def test_premier_search_parses_v5_single_food_object() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.fatsecret.com":
            return token_response()

        return httpx.Response(200, json=premier_search_payload(
            food_payload(
                food_id="1",
                food_name="Chicken Breast",
                servings=[serving_payload(serving_id="serving-1")],
            ),
        ))

    async def scenario():
        provider = make_provider(handler)
        return await provider.search_foods("chicken", 1, 20)

    result = run(scenario())

    assert len(result.items) == 1
    assert result.items[0].source_food_id == "1"
    assert result.items[0].source_food_name == "Chicken Breast"
    assert result.items[0].source_serving_id == "serving-1"


def test_premier_empty_search_missing_results_is_successful() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.fatsecret.com":
            return token_response()

        return httpx.Response(200, json=premier_search_payload(
            None,
            total_results="0",
            include_results=False,
        ))

    async def scenario():
        provider = make_provider(handler)
        return await provider.search_foods("missing", 1, 20)

    result = run(scenario())

    assert result.items == []
    assert result.has_more is False


def test_premier_search_request_includes_region_language_zero_based_page_and_max_page_size() -> None:
    api_requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.fatsecret.com":
            return token_response()

        api_requests.append(request)
        return httpx.Response(200, json=premier_search_payload([
            food_payload(servings=[serving_payload()]),
        ]))

    async def scenario():
        provider = make_provider(handler)
        return await provider.search_foods("chicken", 1, 75)

    result = run(scenario())

    assert result.page_size == 50
    assert len(api_requests) == 1
    params = request_params(api_requests[0])
    assert str(api_requests[0].url).startswith(FATSECRET_API_ENDPOINT)
    assert params["method"] == "foods.search.v5"
    assert params["region"] == "KR"
    assert params["language"] == "ko"
    assert params["page_number"] == "0"
    assert params["max_results"] == "50"
    assert params["format"] == "json"
    assert params["flag_default_serving"] == "true"


def test_selects_exact_100g_serving_before_default_serving() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.fatsecret.com":
            return token_response()

        return httpx.Response(200, json=premier_search_payload([
            food_payload(servings=[
                serving_payload(
                    serving_id="serving-default",
                    amount="50",
                    calories="80",
                    is_default="1",
                    description="50 g",
                ),
                serving_payload(
                    serving_id="serving-100g",
                    amount="100.000",
                    calories="165",
                    description="100 g",
                ),
            ]),
        ]))

    async def scenario():
        provider = make_provider(handler)
        return await provider.search_foods("chicken", 1, 20)

    result = run(scenario())
    item = result.items[0]

    assert item.source_serving_id == "serving-100g"
    assert item.serving_size == 100
    assert item.calories_kcal == 165


def test_selects_default_serving_when_no_exact_100g_serving_exists() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.fatsecret.com":
            return token_response()

        return httpx.Response(200, json=premier_search_payload([
            food_payload(servings=[
                serving_payload(
                    serving_id="serving-first",
                    amount="30",
                    calories="40",
                    description="30 g",
                ),
                serving_payload(
                    serving_id="serving-default",
                    amount="50",
                    calories="70",
                    description="50 g",
                    is_default="true",
                ),
            ]),
        ]))

    async def scenario():
        provider = make_provider(handler)
        return await provider.search_foods("chicken", 1, 20)

    result = run(scenario())
    item = result.items[0]

    assert item.source_serving_id == "serving-default"
    assert item.serving_size == 50
    assert item.calories_kcal == 70


def test_search_uses_food_get_fallback_only_when_search_serving_is_insufficient() -> None:
    methods: list[str] = []
    detail_food_ids: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.fatsecret.com":
            return token_response()

        params = request_params(request)
        methods.append(params["method"])

        if params["method"] == "foods.search.v5":
            return httpx.Response(200, json=premier_search_payload([
                food_payload(
                    food_id="123",
                    food_name="Chicken Breast",
                    servings=[serving_payload(serving_id="serving-search")],
                ),
                food_payload(food_id="456", food_name="Turkey Breast", servings=None),
            ], total_results="2"))

        detail_food_ids.append(params["food_id"])
        return httpx.Response(200, json={
            "food": food_payload(
                food_id="456",
                food_name="Turkey Breast",
                servings=[serving_payload(serving_id="serving-detail", calories="135")],
            ),
        })

    async def scenario():
        provider = make_provider(handler)
        return await provider.search_foods("turkey", 1, 20)

    result = run(scenario())

    assert methods.count("foods.search.v5") == 1
    assert methods.count("food.get.v5") == 1
    assert detail_food_ids == ["456"]
    assert [item.source_food_id for item in result.items] == ["123", "456"]
    assert result.items[0].source_serving_id == "serving-search"
    assert result.items[1].source_serving_id == "serving-detail"
    assert result.items[1].calories_kcal == 135


def test_string_zero_is_preserved_and_missing_values_become_null() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.fatsecret.com":
            return token_response()

        return httpx.Response(200, json=premier_search_payload([
            food_payload(servings=[serving_payload(
                calories="",
                protein=None,
                carbohydrate="0",
                fat="not-a-number",
            )]),
        ]))

    async def scenario():
        provider = make_provider(handler)
        return await provider.search_foods("chicken", 1, 20)

    result = run(scenario())
    item = result.items[0]

    assert item.calories_kcal is None
    assert item.protein_g is None
    assert item.carbs_g == 0
    assert item.fat_g is None


def test_invalid_detail_response_is_provider_error_not_item_omission() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.fatsecret.com":
            return token_response()

        params = request_params(request)

        if params["method"] == "foods.search":
            return httpx.Response(200, json=basic_search_payload([
                food_payload(food_id="1", food_name="Apple"),
            ]))

        return httpx.Response(200, json={"food": {"food_id": "1"}})

    async def scenario() -> None:
        provider = make_provider(
            handler,
            config=make_config(api_edition="basic", region="US", language="en"),
        )
        await provider.search_foods("apple", 1, 10)

    with pytest.raises(FatSecretInvalidResponseError):
        run(scenario())


def test_detail_timeout_is_provider_error_not_hanging_request() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.fatsecret.com":
            return token_response()

        params = request_params(request)

        if params["method"] == "foods.search":
            return httpx.Response(200, json=basic_search_payload([
                food_payload(food_id="1", food_name="Apple"),
            ]))

        await asyncio.sleep(0.05)
        return httpx.Response(200, json={
            "food": food_payload(
                food_id="1",
                food_name="Apple",
                servings=[serving_payload()],
            ),
        })

    async def scenario() -> None:
        provider = make_provider(
            handler,
            config=make_config(
                api_edition="basic",
                region="US",
                language="en",
                timeout_seconds=0.01,
            ),
        )
        await provider.search_foods("apple", 1, 10)

    with pytest.raises(FatSecretTimeoutError):
        run(scenario())

@pytest.mark.parametrize(
    ("status_code", "error_type"),
    [
        (401, FatSecretAuthenticationError),
        (403, FatSecretPermissionError),
        (429, FatSecretRateLimitError),
    ],
)
def test_detail_provider_errors_are_not_hidden_as_empty_results(
    status_code: int,
    error_type: type[Exception],
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.fatsecret.com":
            return token_response()

        params = request_params(request)

        if params["method"] == "foods.search":
            return httpx.Response(200, json=basic_search_payload([
                food_payload(food_id="1", food_name="Apple"),
            ]))

        return httpx.Response(status_code, json={"error": {"message": "detail error"}})

    async def scenario() -> None:
        provider = make_provider(
            handler,
            config=make_config(api_edition="basic", region="US", language="en"),
        )
        await provider.search_foods("apple", 1, 10)

    with pytest.raises(error_type):
        run(scenario())


def test_authentication_failure_is_classified() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "invalid_client"})

    async def scenario() -> str:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
            client = FatSecretClient(make_config(), http_client=http_client)
            return await client.get_access_token()

    with pytest.raises(FatSecretAuthenticationError):
        run(scenario())


def test_missing_scope_is_permission_error_not_empty_results() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.fatsecret.com":
            return token_response()

        return httpx.Response(200, json={"error": {"message": "missing scope foods.search.v5"}})

    async def scenario() -> None:
        provider = make_provider(handler)
        await provider.search_foods("chicken", 1, 20)

    with pytest.raises(FatSecretPermissionError):
        run(scenario())


def test_rate_limit_is_classified() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.fatsecret.com":
            return token_response()

        return httpx.Response(429, json={"error": {"message": "rate limit"}})

    async def scenario() -> None:
        provider = make_provider(handler)
        await provider.search_foods("chicken", 1, 20)

    with pytest.raises(FatSecretRateLimitError):
        run(scenario())


def test_timeout_is_classified() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.fatsecret.com":
            return token_response()

        raise httpx.ReadTimeout("timed out", request=request)

    async def scenario() -> None:
        provider = make_provider(handler)
        await provider.search_foods("chicken", 1, 20)

    with pytest.raises(FatSecretTimeoutError):
        run(scenario())


def test_invalid_json_is_classified() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.fatsecret.com":
            return token_response()

        return httpx.Response(200, content=b"not-json")

    async def scenario() -> None:
        provider = make_provider(handler)
        await provider.search_foods("chicken", 1, 20)

    with pytest.raises(FatSecretInvalidResponseError):
        run(scenario())


def test_invalid_response_shape_is_classified() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.fatsecret.com":
            return token_response()

        return httpx.Response(200, json={"unexpected": {}})

    async def scenario() -> None:
        provider = make_provider(handler)
        await provider.search_foods("chicken", 1, 20)

    with pytest.raises(FatSecretInvalidResponseError):
        run(scenario())


def test_empty_search_results_are_successful_empty_items() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.fatsecret.com":
            return token_response()

        return httpx.Response(200, json=premier_search_payload(None, total_results="0"))

    async def scenario():
        provider = make_provider(handler)
        return await provider.search_foods("no-match", 1, 20)

    result = run(scenario())

    assert result.items == []
    assert result.has_more is False


@pytest.mark.parametrize("error_code", [20, "20"])
def test_api_error_code_20_is_unavailable(error_code: int | str) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.fatsecret.com":
            return token_response()

        return httpx.Response(200, json={"error": {"code": error_code}})

    async def scenario() -> None:
        provider = make_provider(handler)
        await provider.search_foods("chicken", 1, 20)

    with pytest.raises(FatSecretUnavailableError):
        run(scenario())


@pytest.mark.parametrize("error_code", [21, "21"])
def test_api_error_code_21_is_permission_error_without_exposing_ip(
    error_code: int | str,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth.fatsecret.com":
            return token_response()

        return httpx.Response(200, json={
            "error": {
                "code": error_code,
                "message": "IP 203.0.113.10 is not allowed",
            },
        })

    async def scenario() -> None:
        provider = make_provider(handler)
        await provider.search_foods("chicken", 1, 20)

    with pytest.raises(FatSecretPermissionError) as exc_info:
        run(scenario())

    assert "203.0.113.10" not in str(exc_info.value)