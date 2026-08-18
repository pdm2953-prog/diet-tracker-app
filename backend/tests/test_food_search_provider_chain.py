import asyncio
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.food import FoodSearchRecord, NutritionSourceMetadata
from app.providers.errors import (
    FatSecretTimeoutError,
    KfindAuthenticationError,
    KfindConfigurationError,
    KfindInvalidResponseError,
    KfindPermissionError,
    KfindRateLimitError,
    KfindTimeoutError,
    KfindUnavailableError,
)
from app.providers.interfaces import (
    FoodSearchProviderLocalization,
    FoodSearchProviderResponse,
    ProviderName,
)
from app.providers.kfind import (
    KFIND_CATEGORY_AUTH,
    KFIND_CATEGORY_MALFORMED_RESPONSE,
    KFIND_CATEGORY_PERMISSION,
    KFIND_CATEGORY_RATE_LIMIT,
    KFIND_CATEGORY_TIMEOUT,
    KFIND_CATEGORY_UNAVAILABLE,
    KFIND_DATA_SOURCE,
)
from app.services import food_search as food_search_module
from app.services.food_search import FoodSearchService, get_food_search_service
from app.services.korean_food_catalog import KoreanFoodCatalog
from app.services.query_translation import KoreanFoodAliasTranslator


def run(coro):
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


class RecordingFoodProvider:
    def __init__(
        self,
        *,
        provider_name: ProviderName,
        localization: FoodSearchProviderLocalization,
        response_items: list[FoodSearchRecord] | None = None,
        error: Exception | None = None,
    ) -> None:
        self._provider_name = provider_name
        self._localization = localization
        self._response_items = response_items or []
        self._error = error
        self.search_calls: list[tuple[str, int, int]] = []
        self.get_calls: list[tuple[str, str | None]] = []

    @property
    def provider_name(self) -> ProviderName:
        return self._provider_name

    @property
    def search_localization(self) -> FoodSearchProviderLocalization:
        return self._localization

    async def search_foods(
        self,
        query: str,
        page: int,
        page_size: int,
    ) -> FoodSearchProviderResponse:
        self.search_calls.append((query, page, page_size))

        if self._error is not None:
            raise self._error

        return FoodSearchProviderResponse(
            items=self._response_items,
            page=page,
            page_size=page_size,
            has_more=False,
        )

    async def get_food(
        self,
        food_id: str,
        serving_id: str | None = None,
    ) -> FoodSearchRecord | None:
        self.get_calls.append((food_id, serving_id))
        return None


def kfind_localization() -> FoodSearchProviderLocalization:
    return FoodSearchProviderLocalization(
        region="KR",
        language="ko",
        supports_korean_query=True,
        requires_english_alias_for_korean_query=False,
        max_page_size=100,
    )


def fatsecret_localization() -> FoodSearchProviderLocalization:
    return FoodSearchProviderLocalization(
        region="US",
        language="en",
        supports_korean_query=False,
        requires_english_alias_for_korean_query=True,
        max_page_size=10,
    )


def empty_catalog() -> KoreanFoodCatalog:
    return KoreanFoodCatalog.from_mapping({"version": 1, "items": []})


def provider_search_catalog() -> KoreanFoodCatalog:
    return KoreanFoodCatalog.from_mapping({
        "version": 1,
        "items": [
            {
                "id": "kr-generic-kimchi-jjigae",
                "canonicalName": "김치찌개",
                "brandName": None,
                "category": "찌개",
                "aliases": ["김치찌개", "김치 찌개"],
                "matchStrategy": "provider_search",
                "externalRefs": [
                    {
                        "provider": "fatsecret",
                        "sourceFoodId": None,
                        "sourceServingId": None,
                        "searchTerms": ["kimchi stew"],
                    }
                ],
            }
        ],
    })


def make_record(
    *,
    data_source: str,
    source_food_id: str,
    source_food_name: str,
    name: str | None = None,
    source_region: str | None = None,
) -> FoodSearchRecord:
    return FoodSearchRecord(
        id=f"{data_source}-{source_food_id}",
        data_source=data_source,
        source_food_id=source_food_id,
        source_food_name=source_food_name,
        name=name or source_food_name,
        display_name=f"{source_food_name} 표시",
        brand_name=None,
        category="찌개",
        serving_description="100 g",
        serving_size=100,
        serving_unit="g",
        calories_kcal=46,
        protein_g=3.38,
        carbs_g=4.44,
        fat_g=1.63,
        source_region=source_region,
        nutrition_source=NutritionSourceMetadata(
            type="mfds" if data_source == "kfind" else "fatsecret",
            name="식품의약품안전처" if data_source == "kfind" else "FatSecret",
            record_id=source_food_id,
            checked_at="2026-08-10",
        ),
    )


def make_service(
    *,
    kfind_provider: RecordingFoodProvider | None = None,
    fatsecret_provider: RecordingFoodProvider | None = None,
    kfind_factory: Callable[[], RecordingFoodProvider] | None = None,
    catalog: KoreanFoodCatalog | None = None,
) -> FoodSearchService:
    fallback_provider = fatsecret_provider or RecordingFoodProvider(
        provider_name="fatsecret",
        localization=fatsecret_localization(),
        response_items=[make_record(
            data_source="fatsecret",
            source_food_id="fat-1",
            source_food_name="FatSecret Result",
            source_region="US",
        )],
    )
    resolved_kfind = kfind_provider or RecordingFoodProvider(
        provider_name=KFIND_DATA_SOURCE,
        localization=kfind_localization(),
    )

    return FoodSearchService(
        fallback_provider,
        KoreanFoodAliasTranslator.from_alias_file(),
        korean_food_catalog=catalog or empty_catalog(),
        primary_search_provider_factory=kfind_factory or (lambda: resolved_kfind),
        primary_search_provider_name=KFIND_DATA_SOURCE,
        primary_search_localization=kfind_localization(),
    )


def test_get_food_search_service_wires_kfind_primary_for_fatsecret_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    kfind_provider = RecordingFoodProvider(
        provider_name=KFIND_DATA_SOURCE,
        localization=kfind_localization(),
        response_items=[make_record(
            data_source="kfind",
            source_food_id="D000001",
            source_food_name="된장찌개",
            source_region="KR",
        )],
    )
    fatsecret_provider = RecordingFoodProvider(
        provider_name="fatsecret",
        localization=fatsecret_localization(),
        response_items=[make_record(
            data_source="fatsecret",
            source_food_id="fat-1",
            source_food_name="FatSecret Result",
            source_region="US",
        )],
    )
    monkeypatch.setattr(food_search_module, "get_food_provider", lambda: fatsecret_provider)
    monkeypatch.setattr(food_search_module, "get_kfind_food_provider", lambda: kfind_provider)
    monkeypatch.setattr(food_search_module, "get_korean_food_catalog", empty_catalog)

    service = get_food_search_service()
    result = run(service.search_foods("된장찌개", 1, 20))

    assert [item.data_source for item in result.items] == ["kfind"]
    assert kfind_provider.search_calls == [("된장찌개", 1, 20)]
    assert fatsecret_provider.search_calls == []


def test_curated_exact_hit_skips_kfind_and_fatsecret() -> None:
    kfind_provider = RecordingFoodProvider(
        provider_name=KFIND_DATA_SOURCE,
        localization=kfind_localization(),
        response_items=[make_record(
            data_source="kfind",
            source_food_id="kfind-1",
            source_food_name="순두부찌개",
            source_region="KR",
        )],
    )
    fatsecret_provider = RecordingFoodProvider(
        provider_name="fatsecret",
        localization=fatsecret_localization(),
        response_items=[make_record(
            data_source="fatsecret",
            source_food_id="fat-1",
            source_food_name="FatSecret Soondubu",
            source_region="US",
        )],
    )
    service = make_service(
        kfind_provider=kfind_provider,
        fatsecret_provider=fatsecret_provider,
        catalog=KoreanFoodCatalog.from_catalog_file(),
    )

    result = run(service.search_foods("순두부찌개", 1, 20))

    assert result.items[0].data_source == "curated"
    assert result.items[0].source_food_id == "kr-generic-soondubu-jjigae"
    assert kfind_provider.search_calls == []
    assert fatsecret_provider.search_calls == []


def test_kfind_success_non_empty_returns_kfind_without_fatsecret_call() -> None:
    kfind_provider = RecordingFoodProvider(
        provider_name=KFIND_DATA_SOURCE,
        localization=kfind_localization(),
        response_items=[make_record(
            data_source="kfind",
            source_food_id="D000001",
            source_food_name="된장찌개",
            source_region="KR",
        )],
    )
    fatsecret_provider = RecordingFoodProvider(
        provider_name="fatsecret",
        localization=fatsecret_localization(),
        response_items=[make_record(
            data_source="fatsecret",
            source_food_id="fat-1",
            source_food_name="FatSecret Doenjang",
            source_region="US",
        )],
    )
    service = make_service(
        kfind_provider=kfind_provider,
        fatsecret_provider=fatsecret_provider,
    )

    result = run(service.search_foods("된장찌개", 1, 20))

    assert [item.data_source for item in result.items] == ["kfind"]
    assert kfind_provider.search_calls == [("된장찌개", 1, 20)]
    assert fatsecret_provider.search_calls == []


def test_catalog_provider_search_does_not_preempt_kfind_primary() -> None:
    kfind_provider = RecordingFoodProvider(
        provider_name=KFIND_DATA_SOURCE,
        localization=kfind_localization(),
        response_items=[make_record(
            data_source="kfind",
            source_food_id="D000100",
            source_food_name="김치찌개",
            source_region="KR",
        )],
    )
    fatsecret_provider = RecordingFoodProvider(
        provider_name="fatsecret",
        localization=fatsecret_localization(),
        response_items=[make_record(
            data_source="fatsecret",
            source_food_id="fat-1",
            source_food_name="Kimchi Stew",
            source_region="US",
        )],
    )
    service = make_service(
        kfind_provider=kfind_provider,
        fatsecret_provider=fatsecret_provider,
        catalog=provider_search_catalog(),
    )

    result = run(service.search_foods("김치찌개", 1, 20))

    assert [item.data_source for item in result.items] == ["kfind"]
    assert kfind_provider.search_calls == [("김치찌개", 1, 20)]
    assert fatsecret_provider.search_calls == []


def test_kfind_empty_falls_back_to_fatsecret_result() -> None:
    kfind_provider = RecordingFoodProvider(
        provider_name=KFIND_DATA_SOURCE,
        localization=kfind_localization(),
        response_items=[],
    )
    fatsecret_provider = RecordingFoodProvider(
        provider_name="fatsecret",
        localization=fatsecret_localization(),
        response_items=[make_record(
            data_source="fatsecret",
            source_food_id="fat-1",
            source_food_name="FatSecret Result",
            source_region="US",
        )],
    )
    service = make_service(
        kfind_provider=kfind_provider,
        fatsecret_provider=fatsecret_provider,
        catalog=provider_search_catalog(),
    )

    result = run(service.search_foods("김치찌개", 1, 20))

    assert [item.data_source for item in result.items] == ["fatsecret"]
    assert result.items[0].canonical_name == "김치찌개"
    assert kfind_provider.search_calls == [("김치찌개", 1, 20)]
    assert fatsecret_provider.search_calls == [("kimchi stew", 1, 10)]


@pytest.mark.parametrize(
    "error",
    [
        KfindAuthenticationError(provider_error_type=KFIND_CATEGORY_AUTH, operation="search"),
        KfindPermissionError(provider_error_type=KFIND_CATEGORY_PERMISSION, operation="search"),
        KfindRateLimitError(provider_error_type=KFIND_CATEGORY_RATE_LIMIT, operation="search"),
        KfindTimeoutError(provider_error_type=KFIND_CATEGORY_TIMEOUT, operation="search"),
        KfindUnavailableError(provider_error_type=KFIND_CATEGORY_UNAVAILABLE, operation="search"),
        KfindInvalidResponseError(
            provider_error_type=KFIND_CATEGORY_MALFORMED_RESPONSE,
            operation="search",
        ),
        KfindConfigurationError(operation="search"),
    ],
)
def test_kfind_known_failures_fall_back_to_fatsecret(error: Exception) -> None:
    kfind_provider = RecordingFoodProvider(
        provider_name=KFIND_DATA_SOURCE,
        localization=kfind_localization(),
        error=error,
    )
    fatsecret_provider = RecordingFoodProvider(
        provider_name="fatsecret",
        localization=fatsecret_localization(),
        response_items=[make_record(
            data_source="fatsecret",
            source_food_id="fat-1",
            source_food_name="FatSecret Result",
            source_region="US",
        )],
    )
    service = make_service(
        kfind_provider=kfind_provider,
        fatsecret_provider=fatsecret_provider,
        catalog=provider_search_catalog(),
    )

    result = run(service.search_foods("김치찌개", 1, 20))

    assert [item.data_source for item in result.items] == ["fatsecret"]
    assert kfind_provider.search_calls == [("김치찌개", 1, 20)]
    assert fatsecret_provider.search_calls == [("kimchi stew", 1, 10)]


def test_kfind_configuration_factory_error_falls_back_to_fatsecret() -> None:
    fatsecret_provider = RecordingFoodProvider(
        provider_name="fatsecret",
        localization=fatsecret_localization(),
        response_items=[make_record(
            data_source="fatsecret",
            source_food_id="fat-1",
            source_food_name="FatSecret Result",
            source_region="US",
        )],
    )
    service = make_service(
        fatsecret_provider=fatsecret_provider,
        kfind_factory=lambda: (_ for _ in ()).throw(KfindConfigurationError(operation="search")),
        catalog=provider_search_catalog(),
    )

    result = run(service.search_foods("김치찌개", 1, 20))

    assert [item.data_source for item in result.items] == ["fatsecret"]
    assert fatsecret_provider.search_calls == [("kimchi stew", 1, 10)]


@pytest.mark.parametrize("error", [RuntimeError("bug"), TypeError("bug")])
def test_kfind_unexpected_errors_propagate_without_fatsecret_call(error: Exception) -> None:
    kfind_provider = RecordingFoodProvider(
        provider_name=KFIND_DATA_SOURCE,
        localization=kfind_localization(),
        error=error,
    )
    fatsecret_provider = RecordingFoodProvider(
        provider_name="fatsecret",
        localization=fatsecret_localization(),
    )
    service = make_service(
        kfind_provider=kfind_provider,
        fatsecret_provider=fatsecret_provider,
    )

    with pytest.raises(type(error)):
        run(service.search_foods("김치찌개", 1, 20))

    assert kfind_provider.search_calls == [("김치찌개", 1, 20)]
    assert fatsecret_provider.search_calls == []


def test_fatsecret_failure_after_kfind_fallback_uses_fatsecret_error_contract() -> None:
    kfind_provider = RecordingFoodProvider(
        provider_name=KFIND_DATA_SOURCE,
        localization=kfind_localization(),
        error=KfindTimeoutError(provider_error_type=KFIND_CATEGORY_TIMEOUT, operation="search"),
    )
    fatsecret_error = FatSecretTimeoutError(operation="search")
    fatsecret_provider = RecordingFoodProvider(
        provider_name="fatsecret",
        localization=fatsecret_localization(),
        error=fatsecret_error,
    )
    service = make_service(
        kfind_provider=kfind_provider,
        fatsecret_provider=fatsecret_provider,
        catalog=provider_search_catalog(),
    )

    with pytest.raises(FatSecretTimeoutError) as exc_info:
        run(service.search_foods("김치찌개", 1, 20))

    assert exc_info.value is fatsecret_error
    assert kfind_provider.search_calls == [("김치찌개", 1, 20)]
    assert fatsecret_provider.search_calls == [("kimchi stew", 1, 10)]


def test_kfind_result_fields_are_preserved_through_api_dto() -> None:
    kfind_provider = RecordingFoodProvider(
        provider_name=KFIND_DATA_SOURCE,
        localization=kfind_localization(),
        response_items=[make_record(
            data_source="kfind",
            source_food_id="D000001",
            source_food_name="된장찌개_우렁",
            name="된장찌개_우렁",
            source_region="KR",
        )],
    )
    service = make_service(kfind_provider=kfind_provider)
    app.dependency_overrides[get_food_search_service] = lambda: service

    response = TestClient(app).get("/api/v1/foods/search", params={"q": "된장찌개"})

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["dataSource"] == "kfind"
    assert item["sourceFoodId"] == "D000001"
    assert item["sourceFoodName"] == "된장찌개_우렁"
    assert item["name"] == "된장찌개_우렁"
    assert item["displayName"] == "된장찌개_우렁 표시"
    assert item["servingSize"] == 100
    assert item["servingUnit"] == "g"
    assert item["servingDescription"] == "100 g"
    assert item["sourceRegion"] == "KR"
    assert item["nutritionPerServing"] == {
        "caloriesKcal": 46,
        "proteinG": 3.38,
        "carbsG": 4.44,
        "fatG": 1.63,
    }
    assert item["nutritionSource"] == {
        "type": "mfds",
        "name": "식품의약품안전처",
        "url": None,
        "recordId": "D000001",
        "checkedAt": "2026-08-10",
    }
