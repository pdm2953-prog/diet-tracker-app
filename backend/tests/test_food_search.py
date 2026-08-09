import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app, create_app
from app.models.food import FoodSearchRecord, NutritionSourceMetadata
from app.providers.factory import get_food_provider
from app.providers.interfaces import (
    FoodSearchProviderLocalization,
    FoodSearchProviderResponse,
    ProviderName,
)
from app.services.food_search import (
    FoodSearchService,
    FoodSearchServiceResponse,
    get_food_search_service,
)
from app.services.query_translation import (
    FoodSearchQueryTranslation,
    KoreanFoodAliasTranslator,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolate_food_provider(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("FOOD_PROVIDER", "mock")
    get_settings.cache_clear()
    get_food_provider.cache_clear()
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()
    get_settings.cache_clear()
    get_food_provider.cache_clear()


def test_food_search_returns_matching_foods() -> None:
    response = client.get("/api/v1/foods/search", params={"q": "닭가슴살"})

    assert response.status_code == 200
    body = response.json()
    assert body["page"] == 1
    assert body["pageSize"] == 20
    assert body["hasMore"] is False
    assert body["query"] is None
    assert len(body["items"]) == 1
    assert body["items"][0]["name"] == "닭가슴살"
    assert body["items"][0]["dataSource"] == "mock"
    assert body["items"][0]["sourceFoodId"] == "mock-chicken-breast"


def test_food_search_returns_empty_result() -> None:
    response = client.get("/api/v1/foods/search", params={"q": "없는음식"})

    assert response.status_code == 200
    assert response.json() == {
        "items": [],
        "page": 1,
        "pageSize": 20,
        "hasMore": False,
        "query": None,
    }


def test_food_search_rejects_blank_query() -> None:
    response = client.get("/api/v1/foods/search", params={"q": "   "})

    assert response.status_code == 422


def test_food_search_validates_page_and_page_size() -> None:
    invalid_params = (
        {"q": "바나나", "page": 0},
        {"q": "바나나", "pageSize": 0},
        {"q": "바나나", "pageSize": 51},
        {"q": "바나나", "pageSize": -1},
        {"q": "바나나", "pageSize": "abc"},
    )

    for params in invalid_params:
        response = client.get("/api/v1/foods/search", params=params)

        assert response.status_code == 422


@pytest.mark.parametrize(
    ("requested_page_size", "effective_page_size"),
    [
        (1, 1),
        (5, 5),
        (10, 10),
        (11, 10),
        (20, 10),
        (50, 10),
    ],
)
def test_food_search_basic_provider_caps_page_size_and_returns_effective_value(
    requested_page_size: int,
    effective_page_size: int,
) -> None:
    class BasicCapabilityFoodProvider:
        def __init__(self) -> None:
            self.search_calls: list[tuple[str, int, int]] = []

        @property
        def provider_name(self) -> ProviderName:
            return "fatsecret"

        @property
        def search_localization(self) -> FoodSearchProviderLocalization:
            return FoodSearchProviderLocalization(
                region="US",
                language="en",
                supports_korean_query=False,
                requires_english_alias_for_korean_query=True,
                max_page_size=10,
            )

        async def search_foods(
            self,
            query: str,
            page: int,
            page_size: int,
        ) -> FoodSearchProviderResponse:
            self.search_calls.append((query, page, page_size))

            return FoodSearchProviderResponse(
                items=[
                    FoodSearchRecord(
                        id="fatsecret-123-serving-100",
                        data_source="fatsecret",
                        source_food_id="123",
                        source_food_name="Chicken Breast",
                        source_serving_id="serving-100",
                        name="Chicken Breast",
                        brand_name=None,
                        serving_description="100 g",
                        serving_size=100,
                        serving_unit="g",
                        calories_kcal=165,
                        protein_g=31,
                        carbs_g=0,
                        fat_g=3.6,
                        source_region="US",
                    )
                ],
                page=page,
                page_size=page_size,
                has_more=False,
            )

        async def get_food(self, food_id: str) -> FoodSearchRecord | None:
            return None

    provider = BasicCapabilityFoodProvider()
    service = FoodSearchService(
        provider,
        KoreanFoodAliasTranslator.from_alias_file(),
    )
    app.dependency_overrides[get_food_search_service] = lambda: service

    response = client.get(
        "/api/v1/foods/search",
        params={"q": "닭가슴살", "pageSize": requested_page_size},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["pageSize"] == effective_page_size
    assert body["items"][0]["sourceFoodId"] == "123"
    assert body["items"][0]["name"] == "Chicken Breast"
    assert provider.search_calls == [("chicken breast", 1, effective_page_size)]


def test_food_search_dto_distinguishes_null_from_zero() -> None:
    response = client.get("/api/v1/foods/search", params={"q": "닭가슴살"})

    assert response.status_code == 200
    item = response.json()["items"][0]

    assert item["brandName"] is None
    assert item["nutritionPerServing"]["carbsG"] == 0
    assert item["nutritionPerServing"]["carbsG"] is not None


def test_food_search_reports_unknown_provider_configuration_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FOOD_PROVIDER", "database")
    get_settings.cache_clear()
    get_food_provider.cache_clear()

    response = TestClient(create_app()).get(
        "/api/v1/foods/search",
        params={"q": "바나나"},
    )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "food_provider_configuration_error"


def test_fatsecret_provider_without_credentials_does_not_fall_back_to_mock(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FOOD_PROVIDER", "fatsecret")
    monkeypatch.setenv("FATSECRET_CLIENT_ID", "")
    monkeypatch.setenv("FATSECRET_CLIENT_SECRET", "")
    get_settings.cache_clear()
    get_food_provider.cache_clear()

    response = TestClient(create_app()).get(
        "/api/v1/foods/search",
        params={"q": "바나나"},
    )

    assert response.status_code == 503
    body = response.json()
    assert body["detail"]["code"] == "fatsecret_configuration_error"
    assert "FATSECRET_CLIENT_ID" in body["detail"]["message"]
    assert "mock" not in body["detail"]["message"].casefold()


def test_food_search_response_includes_optional_query_metadata() -> None:
    class FakeFoodSearchService:
        async def search_foods(
            self,
            query: str,
            page: int,
            page_size: int,
        ) -> FoodSearchServiceResponse:
            return FoodSearchServiceResponse(
                items=[],
                page=page,
                page_size=page_size,
                has_more=False,
                query=FoodSearchQueryTranslation(
                    original=query,
                    resolved="chicken breast",
                    was_translated=True,
                    translator_name="korean_food_alias",
                    status="translated",
                    source_language="ko",
                    target_language="en",
                ),
            )

    app.dependency_overrides[get_food_search_service] = lambda: FakeFoodSearchService()
    response = client.get("/api/v1/foods/search", params={"q": "닭가슴살"})

    assert response.status_code == 200
    assert response.json()["query"] == {
        "original": "닭가슴살",
        "resolved": "chicken breast",
        "wasTranslated": True,
        "translator": "korean_food_alias",
        "status": "translated",
    }


def test_food_search_response_localizes_display_name_without_mutating_fatsecret_fields() -> None:
    class FakeFoodSearchService:
        async def search_foods(
            self,
            query: str,
            page: int,
            page_size: int,
        ) -> FoodSearchServiceResponse:
            return FoodSearchServiceResponse(
                items=[
                    FoodSearchRecord(
                        id="fatsecret-123-serving-100",
                        data_source="fatsecret",
                        source_food_id="123",
                        source_food_name="Chicken Breast",
                        source_serving_id="serving-100",
                        name="Chicken Breast",
                        brand_name="FatSecret Brand",
                        serving_description="100 g",
                        serving_size=100,
                        serving_unit="g",
                        calories_kcal=165,
                        protein_g=31,
                        carbs_g=0,
                        fat_g=3.6,
                        source_region="US",
                    )
                ],
                page=page,
                page_size=page_size,
                has_more=False,
            )

    app.dependency_overrides[get_food_search_service] = lambda: FakeFoodSearchService()
    response = client.get("/api/v1/foods/search", params={"q": "chicken breast"})

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["name"] == "Chicken Breast"
    assert item["sourceFoodName"] == "Chicken Breast"
    assert item["displayName"] == "닭가슴살"
    assert item["wasLocalized"] is True
    assert item["displayLocale"] == "ko-KR"
    assert item["localizer"] == "korean_food_name"
    assert item["brandName"] == "FatSecret Brand"
    assert item["sourceFoodId"] == "123"
    assert item["sourceServingId"] == "serving-100"
    assert item["servingSize"] == 100
    assert item["servingUnit"] == "g"
    assert item["servingDescription"] == "100 g"
    assert item["nutritionPerServing"] == {
        "caloriesKcal": 165,
        "proteinG": 31,
        "carbsG": 0,
        "fatG": 3.6,
    }


def test_food_search_response_uses_catalog_canonical_display_name_and_preserves_source_name() -> None:
    class FakeFoodSearchService:
        async def search_foods(
            self,
            query: str,
            page: int,
            page_size: int,
        ) -> FoodSearchServiceResponse:
            return FoodSearchServiceResponse(
                items=[
                    FoodSearchRecord(
                        id="fatsecret-kwasakking-serving-100",
                        data_source="fatsecret",
                        source_food_id="kwasakking-source-id",
                        source_food_name="FatSecret Original Kwasakking",
                        source_serving_id="serving-100",
                        name="FatSecret Original Kwasakking",
                        brand_name="BHC",
                        category="치킨",
                        catalog_id="kr-bhc-kwasakking",
                        canonical_name="콰삭킹",
                        serving_description="100 g",
                        serving_size=100,
                        serving_unit="g",
                        calories_kcal=321,
                        protein_g=22,
                        carbs_g=15,
                        fat_g=18,
                        source_region="US",
                    )
                ],
                page=page,
                page_size=page_size,
                has_more=False,
            )

    app.dependency_overrides[get_food_search_service] = lambda: FakeFoodSearchService()
    response = client.get("/api/v1/foods/search", params={"q": "콰삭킹"})

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["name"] == "FatSecret Original Kwasakking"
    assert item["sourceFoodName"] == "FatSecret Original Kwasakking"
    assert item["displayName"] == "콰삭킹"
    assert item["brandName"] == "BHC"
    assert item["category"] == "치킨"
    assert item["catalogId"] == "kr-bhc-kwasakking"
    assert item["canonicalName"] == "콰삭킹"
    assert item["localizer"] == "korean_food_catalog"
    assert item["nutritionPerServing"] == {
        "caloriesKcal": 321,
        "proteinG": 22,
        "carbsG": 15,
        "fatG": 18,
    }


def test_food_search_response_includes_curated_nutrition_metadata_and_preserves_nulls() -> None:
    class FakeFoodSearchService:
        async def search_foods(
            self,
            query: str,
            page: int,
            page_size: int,
        ) -> FoodSearchServiceResponse:
            return FoodSearchServiceResponse(
                items=[
                    FoodSearchRecord(
                        id="curated-kr-bhc-kwasakking",
                        data_source="curated",
                        source_food_id="kr-bhc-kwasakking",
                        source_food_name="콰삭킹",
                        name="콰삭킹",
                        brand_name="BHC",
                        category="치킨",
                        catalog_id="kr-bhc-kwasakking",
                        canonical_name="콰삭킹",
                        serving_description="100 g",
                        serving_size=100,
                        serving_unit="g",
                        calories_kcal=None,
                        protein_g=20,
                        carbs_g=0,
                        fat_g=None,
                        source_region="KR",
                        nutrition_source=NutritionSourceMetadata(
                            type="brand_official",
                            name="BHC 공식 영양정보",
                            url="https://example.test/bhc",
                            record_id="bhc-kwasakking",
                            checked_at="2026-08-09",
                        ),
                        verification_status="reviewed",
                    )
                ],
                page=page,
                page_size=page_size,
                has_more=False,
            )

    app.dependency_overrides[get_food_search_service] = lambda: FakeFoodSearchService()
    response = client.get("/api/v1/foods/search", params={"q": "콰삭킹"})

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["dataSource"] == "curated"
    assert item["sourceFoodId"] == "kr-bhc-kwasakking"
    assert item["displayName"] == "콰삭킹"
    assert item["nutritionPerServing"] == {
        "caloriesKcal": None,
        "proteinG": 20,
        "carbsG": 0,
        "fatG": None,
    }
    assert item["nutritionSource"] == {
        "type": "brand_official",
        "name": "BHC 공식 영양정보",
        "url": "https://example.test/bhc",
        "recordId": "bhc-kwasakking",
        "checkedAt": "2026-08-09",
    }
    assert item["verificationStatus"] == "reviewed"