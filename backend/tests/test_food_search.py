from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_food_search_returns_matching_foods() -> None:
    response = client.get("/api/v1/foods/search", params={"q": "닭가슴살"})

    assert response.status_code == 200
    body = response.json()
    assert body["page"] == 1
    assert body["pageSize"] == 20
    assert body["hasMore"] is False
    assert len(body["items"]) == 1
    assert body["items"][0]["name"] == "닭가슴살"


def test_food_search_returns_empty_result() -> None:
    response = client.get("/api/v1/foods/search", params={"q": "없는음식"})

    assert response.status_code == 200
    assert response.json() == {
        "items": [],
        "page": 1,
        "pageSize": 20,
        "hasMore": False,
    }


def test_food_search_rejects_blank_query() -> None:
    response = client.get("/api/v1/foods/search", params={"q": "   "})

    assert response.status_code == 422


def test_food_search_validates_page_and_page_size() -> None:
    invalid_params = (
        {"q": "바나나", "page": 0},
        {"q": "바나나", "pageSize": 0},
        {"q": "바나나", "pageSize": 101},
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
