import asyncio

import pytest

from app.models.food import FoodSearchRecord
from app.providers.interfaces import (
    FoodSearchProviderLocalization,
    FoodSearchProviderResponse,
    ProviderName,
)
from app.services.food_search import FoodSearchService
from app.services.query_translation import KoreanFoodAliasTranslator


def run(coro):
    return asyncio.run(coro)


class RecordingFoodProvider:
    def __init__(self, localization: FoodSearchProviderLocalization) -> None:
        self._localization = localization
        self.search_queries: list[str] = []

    @property
    def provider_name(self) -> ProviderName:
        return "fatsecret"

    @property
    def search_localization(self) -> FoodSearchProviderLocalization:
        return self._localization

    async def search_foods(
        self,
        query: str,
        page: int,
        page_size: int,
    ) -> FoodSearchProviderResponse:
        self.search_queries.append(query)

        return FoodSearchProviderResponse(
            items=[make_fatsecret_record()],
            page=page,
            page_size=page_size,
            has_more=False,
        )

    async def get_food(self, food_id: str) -> FoodSearchRecord | None:
        return make_fatsecret_record(source_food_id=food_id)


@pytest.mark.parametrize(
    ("query", "resolved"),
    [
        ("닭가슴살", "chicken breast"),
        ("닭 가슴살", "chicken breast"),
        ("  닭가슴살  ", "chicken breast"),
        ("달걀", "egg"),
    ],
)
def test_korean_food_alias_translator_resolves_initial_aliases(
    query: str,
    resolved: str,
) -> None:
    translation = KoreanFoodAliasTranslator.from_alias_file().translate(
        query,
        source_language="ko",
        target_language="en",
    )

    assert translation.original == query.strip()
    assert translation.resolved == resolved
    assert translation.was_translated is True
    assert translation.translator_name == "korean_food_alias"
    assert translation.status == "translated"


def test_korean_food_alias_translator_normalizes_internal_whitespace() -> None:
    translation = KoreanFoodAliasTranslator.from_alias_file().translate(
        "닭   가슴살",
        source_language="ko",
        target_language="en",
    )

    assert translation.original == "닭 가슴살"
    assert translation.resolved == "chicken breast"
    assert translation.was_translated is True


def test_english_query_is_not_translated() -> None:
    translation = KoreanFoodAliasTranslator.from_alias_file().translate(
        " chicken ",
        source_language="ko",
        target_language="en",
    )

    assert translation.original == "chicken"
    assert translation.resolved == "chicken"
    assert translation.was_translated is False
    assert translation.status == "identity"


def test_fatsecret_basic_searches_with_translated_alias_and_keeps_food_payload() -> None:
    provider = RecordingFoodProvider(fatsecret_basic_localization())
    service = FoodSearchService(provider, KoreanFoodAliasTranslator.from_alias_file())

    result = run(service.search_foods("닭가슴살", 1, 20))

    assert provider.search_queries == ["chicken breast"]
    assert result.query is not None
    assert result.query.original == "닭가슴살"
    assert result.query.resolved == "chicken breast"
    assert result.query.was_translated is True
    assert result.query.translator_name == "korean_food_alias"
    assert result.items[0].name == "Chicken Breast"
    assert result.items[0].source_food_name == "Chicken Breast"
    assert result.items[0].calories_kcal == 165
    assert result.items[0].protein_g == 31


def test_fatsecret_premier_kr_ko_searches_with_original_korean_query() -> None:
    provider = RecordingFoodProvider(fatsecret_premier_kr_ko_localization())
    service = FoodSearchService(provider, KoreanFoodAliasTranslator.from_alias_file())

    result = run(service.search_foods("닭가슴살", 1, 20))

    assert provider.search_queries == ["닭가슴살"]
    assert result.query is None


def test_basic_unknown_korean_alias_returns_explicit_unresolved_empty_result() -> None:
    provider = RecordingFoodProvider(fatsecret_basic_localization())
    service = FoodSearchService(provider, KoreanFoodAliasTranslator.from_alias_file())

    result = run(service.search_foods("미등록음식", 1, 20))

    assert provider.search_queries == []
    assert result.items == []
    assert result.has_more is False
    assert result.page_size == 10
    assert result.query is not None
    assert result.query.original == "미등록음식"
    assert result.query.resolved == "미등록음식"
    assert result.query.was_translated is False
    assert result.query.status == "unresolved"


def fatsecret_basic_localization() -> FoodSearchProviderLocalization:
    return FoodSearchProviderLocalization(
        region="US",
        language="en",
        supports_korean_query=False,
        requires_english_alias_for_korean_query=True,
        max_page_size=10,
    )


def fatsecret_premier_kr_ko_localization() -> FoodSearchProviderLocalization:
    return FoodSearchProviderLocalization(
        region="KR",
        language="ko",
        supports_korean_query=True,
        requires_english_alias_for_korean_query=False,
        max_page_size=50,
    )


def make_fatsecret_record(source_food_id: str = "123") -> FoodSearchRecord:
    return FoodSearchRecord(
        id=f"fatsecret-{source_food_id}-serving-100",
        data_source="fatsecret",
        source_food_id=source_food_id,
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
