from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.models.food import FoodSearchItemDto, FoodSearchRecord, FoodSearchResponseDto

router = APIRouter(prefix="/foods", tags=["foods"])

MOCK_FOODS: tuple[FoodSearchRecord, ...] = (
    FoodSearchRecord(
        id="mock-chicken-breast",
        name="닭가슴살",
        brand_name=None,
        serving_size=100,
        serving_unit="g",
        calories_kcal=165,
        protein_g=31,
        carbs_g=0,
        fat_g=3.6,
        keywords=("닭가슴살", "닭", "치킨", "chicken breast"),
    ),
    FoodSearchRecord(
        id="mock-boiled-egg",
        name="삶은 계란",
        brand_name=None,
        serving_size=50,
        serving_unit="g",
        calories_kcal=78,
        protein_g=6.3,
        carbs_g=0.6,
        fat_g=5.3,
        keywords=("삶은 계란", "삶은 달걀", "계란", "달걀", "egg"),
    ),
    FoodSearchRecord(
        id="mock-brown-rice",
        name="현미밥",
        brand_name=None,
        serving_size=210,
        serving_unit="g",
        calories_kcal=320,
        protein_g=6.2,
        carbs_g=69.3,
        fat_g=2.3,
        keywords=("현미밥", "현미", "밥", "brown rice"),
    ),
    FoodSearchRecord(
        id="mock-banana",
        name="바나나",
        brand_name=None,
        serving_size=100,
        serving_unit="g",
        calories_kcal=89,
        protein_g=1.1,
        carbs_g=22.8,
        fat_g=0.3,
        keywords=("바나나", "banana"),
    ),
    FoodSearchRecord(
        id="mock-sweet-potato",
        name="고구마",
        brand_name=None,
        serving_size=130,
        serving_unit="g",
        calories_kcal=112,
        protein_g=2,
        carbs_g=26.1,
        fat_g=0.1,
        keywords=("고구마", "sweet potato"),
    ),
)


@router.get("/search", response_model=FoodSearchResponseDto)
def search_foods(
    q: Annotated[str, Query(description="Food name search text")],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> FoodSearchResponseDto:
    normalized_query = q.strip().casefold()

    if len(normalized_query) < 2:
        raise HTTPException(
            status_code=422,
            detail="q must contain at least 2 non-whitespace characters.",
        )

    matching_foods = [
        food
        for food in MOCK_FOODS
        if normalized_query in food.search_text
    ]
    start_index = (page - 1) * page_size
    end_index = start_index + page_size
    page_items = matching_foods[start_index:end_index]

    return FoodSearchResponseDto(
        items=[FoodSearchItemDto.from_record(food) for food in page_items],
        page=page,
        pageSize=page_size,
        hasMore=end_index < len(matching_foods),
    )
