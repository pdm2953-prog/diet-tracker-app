import pytest

from app.services.korean_food_catalog import (
    KoreanFoodCatalog,
    KoreanFoodCatalogValidationError,
)


def test_starter_catalog_resolves_brand_aliases_to_same_entry() -> None:
    catalog = KoreanFoodCatalog.from_catalog_file()

    bburinkle_ids = {
        catalog.resolve(query).id  # type: ignore[union-attr]
        for query in ("뿌링클", "BHC 뿌링클", "bhc 뿌링클", "비에이치씨 뿌링클")
    }
    kwasakking_ids = {
        catalog.resolve(query).id  # type: ignore[union-attr]
        for query in ("콰삭킹", "BHC 콰삭킹")
    }

    assert bburinkle_ids == {"kr-bhc-bburinkle"}
    assert kwasakking_ids == {"kr-bhc-kwasakking"}


def test_starter_catalog_brand_audit_targets_are_pending_external_id() -> None:
    catalog = KoreanFoodCatalog.from_catalog_file()
    expected_items = {
        "뿌링클": ("kr-bhc-bburinkle", "뿌링클", "BHC"),
        "콰삭킹": ("kr-bhc-kwasakking", "콰삭킹", "BHC"),
        "맛초킹": ("kr-bhc-macho-king", "맛초킹", "BHC"),
        "교촌 허니콤보": ("kr-kyochon-honey-combo", "허니콤보", "교촌"),
        "교촌 레드콤보": ("kr-kyochon-red-combo", "레드콤보", "교촌"),
        "교촌오리지날": ("kr-kyochon-original", "교촌오리지날", "교촌"),
        "굽네 고추바사삭": ("kr-goobne-gochubasasak", "고추바사삭", "굽네"),
        "굽네오리지널": ("kr-goobne-original", "굽네 오리지널", "굽네"),
        "굽네 볼케이노": ("kr-goobne-volcano", "볼케이노", "굽네"),
        "지코바 숯불양념치킨": (
            "kr-zigova-charcoal-yangnyeom-chicken",
            "숯불양념치킨",
            "지코바",
        ),
        "엽떡": ("kr-dongdaemun-yeopgi-tteokbokki", "엽기떡볶이", "동대문엽기떡볶이"),
        "엽떡 로제": (
            "kr-dongdaemun-yeopgi-rose-tteokbokki",
            "로제떡볶이",
            "동대문엽기떡볶이",
        ),
        "엽떡 마라": (
            "kr-dongdaemun-yeopgi-mara-tteokbokki",
            "마라떡볶이",
            "동대문엽기떡볶이",
        ),
        "신전 떡볶이": ("kr-sinjeon-tteokbokki", "신전떡볶이", "신전떡볶이"),
    }

    for query, (catalog_id, canonical_name, brand_name) in expected_items.items():
        item = catalog.resolve(query)

        assert item is not None
        assert item.id == catalog_id
        assert item.canonical_name == canonical_name
        assert item.brand_name == brand_name
        assert item.match_strategy == "external_id"
        assert item.external_refs[0].source_food_id is None
        assert item.external_refs[0].source_serving_id is None
        assert item.external_refs[0].search_terms == ()
        assert item.nutrition is None
        assert item.nutrition_source is None
        assert item.verification_status is None

def test_starter_catalog_keeps_kwasakking_unverified_without_source_food_id() -> None:
    catalog = KoreanFoodCatalog.from_catalog_file()

    kwasakking = catalog.resolve("콰삭킹")

    assert kwasakking is not None
    assert kwasakking.match_strategy == "external_id"
    assert kwasakking.external_refs[0].source_food_id is None
    assert kwasakking.external_refs[0].source_serving_id is None
    assert kwasakking.external_refs[0].search_terms == ()
    assert kwasakking.nutrition is None
    assert kwasakking.nutrition_source is None
    assert kwasakking.verification_status is None


def test_starter_catalog_resolves_yeopddeok_and_generic_food() -> None:
    catalog = KoreanFoodCatalog.from_catalog_file()

    yeopddeok = catalog.resolve("엽떡")
    kimchi_jjigae = catalog.resolve("김치찌개")

    assert yeopddeok is not None
    assert yeopddeok.id == "kr-dongdaemun-yeopgi-tteokbokki"
    assert yeopddeok.canonical_name == "엽기떡볶이"
    assert kimchi_jjigae is not None
    assert kimchi_jjigae.id == "kr-generic-kimchi-jjigae"
    assert kimchi_jjigae.match_strategy == "provider_search"
    assert kimchi_jjigae.external_refs[0].search_terms == ("kimchi jjigae",)


def test_starter_catalog_provider_search_seed_terms_are_verified_or_pending() -> None:
    catalog = KoreanFoodCatalog.from_catalog_file()
    expected_terms = {
        "김치찌개": ("kimchi jjigae",),
        "된장찌개": (),
        "순두부찌개": (),
        "부대찌개": (),
        "제육볶음": (),
        "불고기": ("bulgogi",),
        "비빔밥": ("bibimbap",),
        "김치볶음밥": ("kimchi fried rice",),
        "떡볶이": ("tteokbokki",),
        "순대": (),
        "김밥": ("gimbap",),
        "냉면": ("cold noodles",),
        "삼겹살": (),
        "보쌈": (),
        "족발": (),
    }

    for query, search_terms in expected_terms.items():
        item = catalog.resolve(query)

        assert item is not None
        assert item.match_strategy == "provider_search"
        assert item.external_refs[0].source_food_id is None
        assert item.external_refs[0].source_serving_id is None
        assert item.external_refs[0].search_terms == search_terms


def test_catalog_parses_curated_nutrition_and_source_metadata() -> None:
    catalog = KoreanFoodCatalog.from_mapping({
        "version": 1,
        "items": [valid_curated_nutrition_item()],
    })

    item = catalog.resolve("테스트치킨")

    assert item is not None
    assert item.match_strategy == "curated_nutrition"
    assert item.has_usable_curated_nutrition is True
    assert item.external_refs == ()
    assert item.nutrition is not None
    assert item.nutrition.serving_size == 100
    assert item.nutrition.serving_unit == "g"
    assert item.nutrition.calories_kcal == 250
    assert item.nutrition.protein_g == 21
    assert item.nutrition.carbs_g == 0
    assert item.nutrition.fat_g is None
    assert item.nutrition_source is not None
    assert item.nutrition_source.source_type == "brand_official"
    assert item.nutrition_source.name == "BHC 공식 영양정보"
    assert item.nutrition_source.url == "https://example.test/bhc"
    assert item.nutrition_source.record_id == "bhc-test-chicken"
    assert item.nutrition_source.checked_at == "2026-08-09"
    assert item.verification_status == "official"


def test_curated_nutrition_needs_verification_is_not_usable() -> None:
    item = valid_curated_nutrition_item()
    item["verificationStatus"] = "needs_verification"
    catalog = KoreanFoodCatalog.from_mapping({"version": 1, "items": [item]})

    resolved_item = catalog.resolve("테스트치킨")

    assert resolved_item is not None
    assert resolved_item.has_usable_curated_nutrition is False


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda item: item.update({"id": "duplicate-id"}), "Duplicate catalog id"),
        (lambda item: item.update({"aliases": [""]}), "cannot be empty"),
        (lambda item: item.update({"matchStrategy": "fuzzy"}), "matchStrategy"),
        (lambda item: item.update({"externalRefs": []}), "externalRefs"),
        (
            lambda item: item["externalRefs"][0].update({"sourceServingId": "serving-1"}),
            "sourceServingId requires sourceFoodId",
        ),
        (
            lambda item: item["externalRefs"][0].update({"provider": "unknown"}),
            "provider is unknown",
        ),
    ],
)
def test_catalog_validation_rejects_malformed_entries(mutate, message: str) -> None:
    item_a = valid_external_id_item("duplicate-id", "테스트A", ["테스트A"])
    item_b = valid_external_id_item("other-id", "테스트B", ["테스트B"])
    mutate(item_b)

    with pytest.raises(KoreanFoodCatalogValidationError, match=message):
        KoreanFoodCatalog.from_mapping({"version": 1, "items": [item_a, item_b]})


def test_catalog_validation_rejects_alias_collision() -> None:
    with pytest.raises(KoreanFoodCatalogValidationError, match="Duplicate normalized alias"):
        KoreanFoodCatalog.from_mapping({
            "version": 1,
            "items": [
                valid_external_id_item("food-a", "테스트A", ["공통별칭"]),
                valid_external_id_item("food-b", "테스트B", ["공통별칭"]),
            ],
        })


def test_catalog_validation_allows_pending_provider_search_without_search_terms() -> None:
    item = valid_external_id_item("generic-a", "일반음식", ["일반음식"])
    item["matchStrategy"] = "provider_search"

    catalog = KoreanFoodCatalog.from_mapping({"version": 1, "items": [item]})
    resolved = catalog.resolve("일반음식")

    assert resolved is not None
    assert resolved.match_strategy == "provider_search"
    assert resolved.external_refs[0].search_terms == ()


def test_catalog_validation_rejects_provider_search_without_external_refs() -> None:
    item = valid_external_id_item("generic-a", "일반음식", ["일반음식"])
    item["matchStrategy"] = "provider_search"
    item["externalRefs"] = []

    with pytest.raises(KoreanFoodCatalogValidationError, match="externalRefs"):
        KoreanFoodCatalog.from_mapping({"version": 1, "items": [item]})


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda item: item.pop("nutrition"), "nutrition is required"),
        (lambda item: item.pop("nutritionSource"), "nutritionSource is required"),
        (lambda item: item.pop("verificationStatus"), "verificationStatus is required"),
        (
            lambda item: item["nutrition"].update({"servingSize": 0}),
            "servingSize must be greater than 0",
        ),
        (
            lambda item: item["nutrition"].update({"caloriesKcal": -1}),
            "caloriesKcal must be a non-negative number or null",
        ),
        (
            lambda item: item["nutritionSource"].update({"type": "fatsecret"}),
            "nutritionSource.type",
        ),
        (
            lambda item: item.update({"verificationStatus": "unreviewed"}),
            "verificationStatus",
        ),
    ],
)
def test_catalog_validation_rejects_malformed_curated_nutrition(mutate, message: str) -> None:
    item = valid_curated_nutrition_item()
    mutate(item)

    with pytest.raises(KoreanFoodCatalogValidationError, match=message):
        KoreanFoodCatalog.from_mapping({"version": 1, "items": [item]})


def test_catalog_validation_rejects_nutrition_on_non_curated_item() -> None:
    item = valid_external_id_item("food-a", "테스트A", ["테스트A"])
    item["nutrition"] = valid_curated_nutrition_item()["nutrition"]

    with pytest.raises(KoreanFoodCatalogValidationError, match="curated_nutrition"):
        KoreanFoodCatalog.from_mapping({"version": 1, "items": [item]})


def test_catalog_normalizes_unicode_whitespace_and_english_case() -> None:
    catalog = KoreanFoodCatalog.from_catalog_file()

    assert catalog.resolve("  ＢＨＣ   콰삭킹  ").id == "kr-bhc-kwasakking"  # type: ignore[union-attr]
    assert catalog.resolve("BHC콰삭킹").id == "kr-bhc-kwasakking"  # type: ignore[union-attr]


def valid_external_id_item(
    catalog_id: str,
    canonical_name: str,
    aliases: list[str],
) -> dict[str, object]:
    return {
        "id": catalog_id,
        "canonicalName": canonical_name,
        "brandName": "테스트브랜드",
        "category": "테스트",
        "aliases": aliases,
        "matchStrategy": "external_id",
        "externalRefs": [
            {
                "provider": "fatsecret",
                "sourceFoodId": None,
                "sourceServingId": None,
                "searchTerms": [],
            }
        ],
    }


def valid_curated_nutrition_item() -> dict[str, object]:
    return {
        "id": "kr-test-curated",
        "canonicalName": "테스트치킨",
        "brandName": "BHC",
        "category": "치킨",
        "aliases": ["테스트치킨", "BHC 테스트치킨"],
        "matchStrategy": "curated_nutrition",
        "externalRefs": [],
        "nutrition": {
            "servingSize": 100,
            "servingUnit": "g",
            "caloriesKcal": 250,
            "proteinG": 21,
            "carbsG": 0,
            "fatG": None,
        },
        "nutritionSource": {
            "type": "brand_official",
            "name": "BHC 공식 영양정보",
            "url": "https://example.test/bhc",
            "recordId": "bhc-test-chicken",
            "checkedAt": "2026-08-09",
        },
        "verificationStatus": "official",
    }
