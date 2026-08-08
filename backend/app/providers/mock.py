from app.models.food import FoodSearchRecord
from app.providers.interfaces import (
    FoodSearchProviderLocalization,
    FoodSearchProviderResponse,
    ProviderName,
)


MOCK_FOODS: tuple[FoodSearchRecord, ...] = (
    FoodSearchRecord(
        id="mock-chicken-breast",
        data_source="mock",
        source_food_id="mock-chicken-breast",
        source_food_name="닭가슴살",
        name="닭가슴살",
        brand_name=None,
        serving_description="100 g",
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
        data_source="mock",
        source_food_id="mock-boiled-egg",
        source_food_name="삶은 계란",
        name="삶은 계란",
        brand_name=None,
        serving_description="50 g",
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
        data_source="mock",
        source_food_id="mock-brown-rice",
        source_food_name="현미밥",
        name="현미밥",
        brand_name=None,
        serving_description="210 g",
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
        data_source="mock",
        source_food_id="mock-banana",
        source_food_name="바나나",
        name="바나나",
        brand_name=None,
        serving_description="100 g",
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
        data_source="mock",
        source_food_id="mock-sweet-potato",
        source_food_name="고구마",
        name="고구마",
        brand_name=None,
        serving_description="130 g",
        serving_size=130,
        serving_unit="g",
        calories_kcal=112,
        protein_g=2,
        carbs_g=26.1,
        fat_g=0.1,
        keywords=("고구마", "sweet potato"),
    ),
)


class MockFoodProvider:
    @property
    def provider_name(self) -> ProviderName:
        return "mock"

    @property
    def search_localization(self) -> FoodSearchProviderLocalization:
        return FoodSearchProviderLocalization(
            region="KR",
            language="ko",
            supports_korean_query=True,
            requires_english_alias_for_korean_query=False,
        )

    async def search_foods(
        self,
        query: str,
        page: int,
        page_size: int,
    ) -> FoodSearchProviderResponse:
        normalized_query = query.strip().casefold()
        matching_foods = [
            food
            for food in MOCK_FOODS
            if normalized_query in food.search_text
        ]
        start_index = (page - 1) * page_size
        end_index = start_index + page_size

        return FoodSearchProviderResponse(
            items=matching_foods[start_index:end_index],
            page=page,
            page_size=page_size,
            has_more=end_index < len(matching_foods),
        )

    async def get_food(self, food_id: str) -> FoodSearchRecord | None:
        normalized_food_id = food_id.strip()

        for food in MOCK_FOODS:
            if food.id == normalized_food_id or food.source_food_id == normalized_food_id:
                return food

        return None
