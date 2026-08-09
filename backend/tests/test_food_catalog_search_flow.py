import asyncio

from app.models.food import FoodSearchRecord
from app.providers.interfaces import (
    FoodSearchProviderLocalization,
    FoodSearchProviderResponse,
    ProviderName,
)
from app.services.food_search import FoodSearchService
from app.services.korean_food_catalog import KoreanFoodCatalog
from app.services.query_translation import KoreanFoodAliasTranslator


def run(coro):
    return asyncio.run(coro)


class RecordingFoodProvider:
    def __init__(self) -> None:
        self.search_calls: list[tuple[str, int, int]] = []
        self.get_calls: list[tuple[str, str | None]] = []
        self.records_by_food_id: dict[str, FoodSearchRecord] = {}

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
            items=[make_record(source_food_id=f"search-{query}", source_food_name=query.title())],
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

        return self.records_by_food_id.get(food_id)


def test_curated_nutrition_returns_catalog_record_without_provider_call() -> None:
    provider = RecordingFoodProvider()
    service = FoodSearchService(
        provider,
        KoreanFoodAliasTranslator.from_alias_file(),
        korean_food_catalog=make_curated_catalog(),
    )

    result = run(service.search_foods("BHC 테스트치킨", 1, 20))

    assert provider.get_calls == []
    assert provider.search_calls == []
    assert result.query is None
    assert result.page_size == 10
    assert result.has_more is False

    item = result.items[0]
    assert item.id == "curated-kr-test-food"
    assert item.data_source == "curated"
    assert item.source_food_id == "kr-test-food"
    assert item.source_food_name == "테스트치킨"
    assert item.name == "테스트치킨"
    assert item.brand_name == "BHC"
    assert item.category == "치킨"
    assert item.catalog_id == "kr-test-food"
    assert item.canonical_name == "테스트치킨"
    assert item.serving_description == "100 g"
    assert item.serving_size == 100
    assert item.serving_unit == "g"
    assert item.calories_kcal == 250
    assert item.protein_g == 21
    assert item.carbs_g == 0
    assert item.fat_g == 13
    assert item.nutrition_source is not None
    assert item.nutrition_source.type == "brand_official"
    assert item.nutrition_source.name == "BHC 공식 영양정보"
    assert item.nutrition_source.url == "https://example.test/bhc"
    assert item.nutrition_source.record_id == "bhc-test-chicken"
    assert item.nutrition_source.checked_at == "2026-08-10"
    assert item.verification_status == "official"


def test_curated_nutrition_preserves_null_nutrition_without_zero_conversion() -> None:
    provider = RecordingFoodProvider()
    service = FoodSearchService(
        provider,
        KoreanFoodAliasTranslator.from_alias_file(),
        korean_food_catalog=make_curated_catalog(
            calories_kcal=None,
            protein_g=None,
            carbs_g=0,
            fat_g=None,
            verification_status="reviewed",
        ),
    )

    result = run(service.search_foods("테스트치킨", 1, 20))

    assert provider.get_calls == []
    assert provider.search_calls == []
    item = result.items[0]
    assert item.calories_kcal is None
    assert item.protein_g is None
    assert item.carbs_g == 0
    assert item.fat_g is None
    assert item.verification_status == "reviewed"


def test_curated_nutrition_needs_verification_does_not_return_unverified_values() -> None:
    provider = RecordingFoodProvider()
    service = FoodSearchService(
        provider,
        KoreanFoodAliasTranslator.from_alias_file(),
        korean_food_catalog=make_curated_catalog(verification_status="needs_verification"),
    )

    result = run(service.search_foods("테스트치킨", 1, 20))

    assert provider.get_calls == []
    assert provider.search_calls == []
    assert result.items == []
    assert result.query is not None
    assert result.query.status == "unresolved"
    assert result.query.translator_name == "korean_food_catalog"


def test_curated_nutrition_estimated_does_not_return_unverified_values() -> None:
    provider = RecordingFoodProvider()
    service = FoodSearchService(
        provider,
        KoreanFoodAliasTranslator.from_alias_file(),
        korean_food_catalog=make_curated_catalog(verification_status="estimated"),
    )

    result = run(service.search_foods("테스트치킨", 1, 20))

    assert provider.get_calls == []
    assert provider.search_calls == []
    assert result.items == []
    assert result.query is not None
    assert result.query.status == "unresolved"
    assert result.query.translator_name == "korean_food_catalog"


def test_curated_nutrition_keeps_original_gram_serving_basis() -> None:
    provider = RecordingFoodProvider()
    service = FoodSearchService(
        provider,
        KoreanFoodAliasTranslator.from_alias_file(),
        korean_food_catalog=make_curated_catalog(
            serving_size=150,
            calories_kcal=360,
            protein_g=30,
            carbs_g=45,
            fat_g=12,
            verification_status="reviewed",
        ),
    )

    result = run(service.search_foods("테스트치킨", 1, 20))

    assert provider.get_calls == []
    assert provider.search_calls == []
    item = result.items[0]
    assert item.serving_description == "150 g"
    assert item.serving_size == 150
    assert item.serving_unit == "g"
    assert item.calories_kcal == 360
    assert item.protein_g == 30
    assert item.carbs_g == 45
    assert item.fat_g == 12
    assert item.verification_status == "reviewed"


def test_starter_soondubu_jjigae_returns_official_curated_result_without_provider_call() -> None:
    provider = RecordingFoodProvider()
    service = FoodSearchService(
        provider,
        KoreanFoodAliasTranslator.from_alias_file(),
        korean_food_catalog=KoreanFoodCatalog.from_catalog_file(),
    )

    result = run(service.search_foods("순두부찌개", 1, 20))

    assert provider.get_calls == []
    assert provider.search_calls == []
    assert result.query is None
    assert result.has_more is False
    assert result.page_size == 10

    item = result.items[0]
    assert item.id == "curated-kr-generic-soondubu-jjigae"
    assert item.data_source == "curated"
    assert item.source_food_id == "kr-generic-soondubu-jjigae"
    assert item.source_food_name == "순두부찌개"
    assert item.name == "순두부찌개"
    assert item.brand_name is None
    assert item.category == "찌개"
    assert item.catalog_id == "kr-generic-soondubu-jjigae"
    assert item.canonical_name == "순두부찌개"
    assert item.serving_description == "400 g"
    assert item.serving_size == 400
    assert item.serving_unit == "g"
    assert item.calories_kcal == 200
    assert item.carbs_g == 8
    assert item.protein_g == 14
    assert item.fat_g == 12
    assert item.nutrition_source is not None
    assert item.nutrition_source.type == "mfds"
    assert item.nutrition_source.name == "식품안전나라"
    assert item.nutrition_source.url == (
        "https://www.foodsafetykorea.go.kr/portal/board/boardDetail.do?"
        "bbs_no=bbs039&menu_grp=MENU_NEW03&menu_no=4847&ntctxt_no=22493"
    )
    assert item.nutrition_source.record_id is None
    assert item.nutrition_source.checked_at == "2026-08-10"
    assert item.verification_status == "official"


def test_external_id_with_source_food_id_uses_direct_lookup_before_search() -> None:
    provider = RecordingFoodProvider()
    provider.records_by_food_id["verified-food-id"] = make_record(
        source_food_id="verified-food-id",
        source_food_name="FatSecret Original Kwasakking",
        source_serving_id="verified-serving-id",
        calories_kcal=321,
    )
    service = FoodSearchService(
        provider,
        KoreanFoodAliasTranslator.from_alias_file(),
        korean_food_catalog=make_external_catalog(
            source_food_id="verified-food-id",
            source_serving_id="verified-serving-id",
            search_terms=["kwasakking fallback"],
        ),
    )

    result = run(service.search_foods("콰삭킹", 1, 20))

    assert provider.get_calls == [("verified-food-id", "verified-serving-id")]
    assert provider.search_calls == []
    assert result.query is None
    assert result.page_size == 10
    assert result.items[0].source_food_id == "verified-food-id"
    assert result.items[0].source_food_name == "FatSecret Original Kwasakking"
    assert result.items[0].calories_kcal == 321
    assert result.items[0].catalog_id == "kr-test-food"
    assert result.items[0].canonical_name == "콰삭킹"
    assert result.items[0].brand_name == "BHC"
    assert result.items[0].category == "치킨"


def test_external_id_pending_does_not_auto_search_or_link_candidates() -> None:
    provider = RecordingFoodProvider()
    service = FoodSearchService(
        provider,
        KoreanFoodAliasTranslator.from_alias_file(),
        korean_food_catalog=make_external_catalog(
            source_food_id=None,
            search_terms=["kwasakking fallback"],
        ),
    )

    result = run(service.search_foods("BHC 콰삭킹", 1, 20))

    assert provider.get_calls == []
    assert provider.search_calls == []
    assert result.items == []
    assert result.query is not None
    assert result.query.status == "unresolved"
    assert result.query.translator_name == "korean_food_catalog"
    assert result.query.resolved == "콰삭킹"


def test_starter_pending_brand_items_return_safe_empty_without_provider_calls() -> None:
    provider = RecordingFoodProvider()
    service = FoodSearchService(
        provider,
        KoreanFoodAliasTranslator.from_alias_file(),
        korean_food_catalog=KoreanFoodCatalog.from_catalog_file(),
    )
    expected_resolutions = {
        "뿌링클": "뿌링클",
        "콰삭킹": "콰삭킹",
        "허니콤보": "허니콤보",
    }

    for query, expected_resolved in expected_resolutions.items():
        provider.get_calls.clear()
        provider.search_calls.clear()

        result = run(service.search_foods(query, 1, 20))

        assert provider.get_calls == []
        assert provider.search_calls == []
        assert result.items == []
        assert result.query is not None
        assert result.query.status == "unresolved"
        assert result.query.translator_name == "korean_food_catalog"
        assert result.query.resolved == expected_resolved


def test_provider_search_uses_catalog_search_terms_without_exposing_query_metadata() -> None:
    provider = RecordingFoodProvider()
    service = FoodSearchService(
        provider,
        KoreanFoodAliasTranslator.from_alias_file(),
        korean_food_catalog=make_provider_search_catalog(),
    )

    result = run(service.search_foods("김치찌개", 1, 20))

    assert provider.search_calls == [("kimchi stew", 1, 10)]
    assert result.query is None
    assert result.items[0].canonical_name == "김치찌개"
    assert result.items[0].category == "찌개"
    assert result.items[0].source_food_name == "Kimchi Stew"


def test_provider_search_pending_without_search_terms_does_not_call_provider() -> None:
    provider = RecordingFoodProvider()
    service = FoodSearchService(
        provider,
        KoreanFoodAliasTranslator.from_alias_file(),
        korean_food_catalog=make_provider_search_catalog(search_terms=[]),
    )

    result = run(service.search_foods("김치찌개", 1, 20))

    assert provider.get_calls == []
    assert provider.search_calls == []
    assert result.items == []
    assert result.query is not None
    assert result.query.status == "unresolved"
    assert result.query.translator_name == "korean_food_catalog"
    assert result.query.resolved == "김치찌개"


def test_catalog_hit_without_provider_route_keeps_safe_unresolved_policy() -> None:
    provider = RecordingFoodProvider()
    service = FoodSearchService(
        provider,
        KoreanFoodAliasTranslator.from_alias_file(),
        korean_food_catalog=make_external_catalog(
            source_food_id=None,
            search_terms=[],
        ),
    )

    result = run(service.search_foods("콰삭킹", 1, 20))

    assert provider.get_calls == []
    assert provider.search_calls == []
    assert result.items == []
    assert result.query is not None
    assert result.query.status == "unresolved"
    assert result.query.translator_name == "korean_food_catalog"
    assert result.query.resolved == "콰삭킹"


def test_catalog_hit_without_verified_route_does_not_fall_through_for_english_alias() -> None:
    provider = RecordingFoodProvider()
    service = FoodSearchService(
        provider,
        KoreanFoodAliasTranslator.from_alias_file(),
        korean_food_catalog=make_external_catalog(
            aliases=["콰삭킹", "BHC Kwasakking"],
            source_food_id=None,
            search_terms=["BHC Kwasakking"],
        ),
    )

    result = run(service.search_foods("BHC Kwasakking", 1, 20))

    assert provider.get_calls == []
    assert provider.search_calls == []
    assert result.items == []
    assert result.query is None


def test_catalog_miss_uses_existing_korean_food_alias_translator() -> None:
    provider = RecordingFoodProvider()
    service = FoodSearchService(
        provider,
        KoreanFoodAliasTranslator.from_alias_file(),
        korean_food_catalog=empty_catalog(),
    )

    result = run(service.search_foods("닭가슴살", 1, 20))

    assert provider.search_calls == [("chicken breast", 1, 10)]
    assert result.query is not None
    assert result.query.translator_name == "korean_food_alias"
    assert result.query.resolved == "chicken breast"


def test_catalog_miss_unknown_korean_query_stays_unresolved() -> None:
    provider = RecordingFoodProvider()
    service = FoodSearchService(
        provider,
        KoreanFoodAliasTranslator.from_alias_file(),
        korean_food_catalog=empty_catalog(),
    )

    result = run(service.search_foods("미등록음식", 1, 20))

    assert provider.get_calls == []
    assert provider.search_calls == []
    assert result.items == []
    assert result.query is not None
    assert result.query.status == "unresolved"


def test_english_query_uses_existing_provider_search() -> None:
    provider = RecordingFoodProvider()
    service = FoodSearchService(
        provider,
        KoreanFoodAliasTranslator.from_alias_file(),
        korean_food_catalog=empty_catalog(),
    )

    result = run(service.search_foods("chicken breast", 1, 20))

    assert provider.search_calls == [("chicken breast", 1, 10)]
    assert result.query is None


def make_external_catalog(
    *,
    canonical_name: str = "콰삭킹",
    brand_name: str | None = "BHC",
    category: str = "치킨",
    aliases: list[str] | None = None,
    source_food_id: str | None,
    source_serving_id: str | None = None,
    search_terms: list[str],
) -> KoreanFoodCatalog:
    return KoreanFoodCatalog.from_mapping({
        "version": 1,
        "items": [
            {
                "id": "kr-test-food",
                "canonicalName": canonical_name,
                "brandName": brand_name,
                "category": category,
                "aliases": aliases or [canonical_name, f"BHC {canonical_name}"],
                "matchStrategy": "external_id",
                "externalRefs": [
                    {
                        "provider": "fatsecret",
                        "sourceFoodId": source_food_id,
                        "sourceServingId": source_serving_id,
                        "searchTerms": search_terms,
                    }
                ],
            }
        ],
    })


def make_provider_search_catalog(search_terms: list[str] | None = None) -> KoreanFoodCatalog:
    return KoreanFoodCatalog.from_mapping({
        "version": 1,
        "items": [
            {
                "id": "kr-test-food",
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
                        "searchTerms": ["kimchi stew"] if search_terms is None else search_terms,
                    }
                ],
            }
        ],
    })


def make_curated_catalog(
    *,
    serving_size: float = 100,
    calories_kcal: float | None = 250,
    protein_g: float | None = 21,
    carbs_g: float | None = 0,
    fat_g: float | None = 13,
    verification_status: str = "official",
) -> KoreanFoodCatalog:
    return KoreanFoodCatalog.from_mapping({
        "version": 1,
        "items": [
            {
                "id": "kr-test-food",
                "canonicalName": "테스트치킨",
                "brandName": "BHC",
                "category": "치킨",
                "aliases": ["테스트치킨", "BHC 테스트치킨"],
                "matchStrategy": "curated_nutrition",
                "externalRefs": [],
                "nutrition": {
                    "servingSize": serving_size,
                    "servingUnit": "g",
                    "caloriesKcal": calories_kcal,
                    "proteinG": protein_g,
                    "carbsG": carbs_g,
                    "fatG": fat_g,
                },
                "nutritionSource": {
                    "type": "brand_official",
                    "name": "BHC 공식 영양정보",
                    "url": "https://example.test/bhc",
                    "recordId": "bhc-test-chicken",
                    "checkedAt": "2026-08-10",
                },
                "verificationStatus": verification_status,
            }
        ],
    })


def empty_catalog() -> KoreanFoodCatalog:
    return KoreanFoodCatalog.from_mapping({"version": 1, "items": []})


def make_record(
    *,
    source_food_id: str = "123",
    source_food_name: str = "Chicken Breast",
    source_serving_id: str = "serving-100",
    calories_kcal: float = 165,
) -> FoodSearchRecord:
    return FoodSearchRecord(
        id=f"fatsecret-{source_food_id}-{source_serving_id}",
        data_source="fatsecret",
        source_food_id=source_food_id,
        source_food_name=source_food_name,
        source_serving_id=source_serving_id,
        name=source_food_name,
        brand_name="Provider Brand",
        serving_description="100 g",
        serving_size=100,
        serving_unit="g",
        calories_kcal=calories_kcal,
        protein_g=31,
        carbs_g=0,
        fat_g=3.6,
        source_region="US",
    )
