import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app, create_app
from app.providers.factory import get_food_provider
from app.services.food_search import FoodSearchServiceResponse, get_food_search_service
from app.services.query_translation import FoodSearchQueryTranslation

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
    )

    for params in invalid_params:
        response = client.get("/api/v1/foods/search", params=params)

        assert response.status_code == 422


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