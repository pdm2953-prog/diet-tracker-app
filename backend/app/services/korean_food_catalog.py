from __future__ import annotations

import json
import math
import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal


DEFAULT_KOREAN_FOOD_CATALOG_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "korean_food_catalog.json"
)
CatalogMatchStrategy = Literal["external_id", "provider_search", "curated_nutrition"]
CatalogNutritionSourceType = Literal["mfds", "brand_official", "manufacturer", "other"]
CatalogVerificationStatus = Literal["official", "reviewed", "estimated", "needs_verification"]
KNOWN_EXTERNAL_PROVIDERS = frozenset(("fatsecret", "database", "user"))
VALID_MATCH_STRATEGIES = frozenset(("external_id", "provider_search", "curated_nutrition"))
VALID_NUTRITION_SOURCE_TYPES = frozenset(("mfds", "brand_official", "manufacturer", "other"))
VALID_VERIFICATION_STATUSES = frozenset(("official", "reviewed", "estimated", "needs_verification"))
USABLE_CURATED_NUTRITION_STATUSES = frozenset(("official", "reviewed"))
WHITESPACE_PATTERN = re.compile(r"\s+")


class KoreanFoodCatalogValidationError(ValueError):
    pass


@dataclass(frozen=True)
class ExternalFoodRef:
    provider: str
    source_food_id: str | None
    source_serving_id: str | None
    search_terms: tuple[str, ...]

    @property
    def has_source_food_id(self) -> bool:
        return self.source_food_id is not None

    @property
    def has_search_terms(self) -> bool:
        return len(self.search_terms) > 0


@dataclass(frozen=True)
class CatalogNutrition:
    serving_size: float
    serving_unit: str
    calories_kcal: float | None
    protein_g: float | None
    carbs_g: float | None
    fat_g: float | None


@dataclass(frozen=True)
class CatalogNutritionSource:
    source_type: CatalogNutritionSourceType
    name: str
    url: str | None
    record_id: str | None
    checked_at: str


@dataclass(frozen=True)
class KoreanFoodCatalogItem:
    id: str
    canonical_name: str
    brand_name: str | None
    category: str
    aliases: tuple[str, ...]
    match_strategy: CatalogMatchStrategy
    external_refs: tuple[ExternalFoodRef, ...]
    nutrition: CatalogNutrition | None = None
    nutrition_source: CatalogNutritionSource | None = None
    verification_status: CatalogVerificationStatus | None = None

    @property
    def has_usable_curated_nutrition(self) -> bool:
        return (
            self.match_strategy == "curated_nutrition"
            and self.nutrition is not None
            and self.nutrition_source is not None
            and self.verification_status in USABLE_CURATED_NUTRITION_STATUSES
        )

    def refs_for_provider(self, provider_name: str) -> tuple[ExternalFoodRef, ...]:
        normalized_provider_name = normalize_catalog_lookup_key(provider_name)

        return tuple(
            external_ref
            for external_ref in self.external_refs
            if external_ref.provider == normalized_provider_name
        )


class KoreanFoodCatalog:
    def __init__(self, items: tuple[KoreanFoodCatalogItem, ...]) -> None:
        self._items = items
        self._items_by_id: dict[str, KoreanFoodCatalogItem] = {}
        self._aliases_by_key: dict[str, KoreanFoodCatalogItem] = {}
        self._canonical_by_key: dict[str, KoreanFoodCatalogItem] = {}
        self._brand_food_by_key: dict[str, KoreanFoodCatalogItem] = {}

        self._build_indexes(items)

    @property
    def items(self) -> tuple[KoreanFoodCatalogItem, ...]:
        return self._items

    @classmethod
    def from_catalog_file(
        cls,
        path: Path = DEFAULT_KOREAN_FOOD_CATALOG_PATH,
    ) -> "KoreanFoodCatalog":
        return cls.from_mapping(json.loads(path.read_text(encoding="utf-8")))

    @classmethod
    def from_mapping(cls, raw_catalog: dict[str, Any]) -> "KoreanFoodCatalog":
        if not isinstance(raw_catalog, dict):
            raise KoreanFoodCatalogValidationError("Korean food catalog must be an object.")

        version = raw_catalog.get("version")
        raw_items = raw_catalog.get("items")

        if isinstance(version, bool) or not isinstance(version, int) or version < 1:
            raise KoreanFoodCatalogValidationError(
                "Korean food catalog requires positive integer version."
            )

        if not isinstance(raw_items, list):
            raise KoreanFoodCatalogValidationError("Korean food catalog requires items list.")

        return cls(tuple(_parse_catalog_item(raw_item, index) for index, raw_item in enumerate(raw_items)))

    def resolve(self, query: str) -> KoreanFoodCatalogItem | None:
        lookup_key = normalize_catalog_lookup_key(query)

        return (
            self._aliases_by_key.get(lookup_key)
            or self._canonical_by_key.get(lookup_key)
            or self._brand_food_by_key.get(lookup_key)
        )

    def _build_indexes(self, items: tuple[KoreanFoodCatalogItem, ...]) -> None:
        registered_query_keys: dict[str, KoreanFoodCatalogItem] = {}

        for item in items:
            existing_item = self._items_by_id.get(item.id)

            if existing_item is not None:
                raise KoreanFoodCatalogValidationError(f"Duplicate catalog id: {item.id}")

            self._items_by_id[item.id] = item

            canonical_key = normalize_catalog_lookup_key(item.canonical_name)
            self._register_lookup_key(
                self._canonical_by_key,
                registered_query_keys,
                canonical_key,
                item,
            )

            for alias in item.aliases:
                alias_key = normalize_catalog_lookup_key(alias)
                self._register_lookup_key(
                    self._aliases_by_key,
                    registered_query_keys,
                    alias_key,
                    item,
                )

            if item.brand_name is not None:
                brand_key = normalize_catalog_lookup_key(item.brand_name)
                brand_food_keys = (
                    f"{brand_key} {canonical_key}",
                    f"{brand_key}{canonical_key}",
                )

                for brand_food_key in brand_food_keys:
                    existing_brand_food_item = self._brand_food_by_key.get(brand_food_key)

                    if (
                        existing_brand_food_item is not None
                        and existing_brand_food_item.id != item.id
                    ):
                        raise KoreanFoodCatalogValidationError(
                            "Duplicate brand and food catalog lookup: "
                            f"{item.brand_name} {item.canonical_name}"
                        )

                    self._brand_food_by_key[brand_food_key] = item

    def _register_lookup_key(
        self,
        target_lookup: dict[str, KoreanFoodCatalogItem],
        registered_query_keys: dict[str, KoreanFoodCatalogItem],
        lookup_key: str,
        item: KoreanFoodCatalogItem,
    ) -> None:
        existing_item = registered_query_keys.get(lookup_key)

        if existing_item is not None and existing_item.id != item.id:
            raise KoreanFoodCatalogValidationError(
                f"Duplicate normalized alias or canonicalName: {lookup_key}"
            )

        registered_query_keys[lookup_key] = item
        target_lookup[lookup_key] = item


def normalize_catalog_text(value: str) -> str:
    normalized_value = unicodedata.normalize("NFKC", value).strip()

    return WHITESPACE_PATTERN.sub(" ", normalized_value)


def normalize_catalog_lookup_key(value: str) -> str:
    return normalize_catalog_text(value).casefold()


def _parse_catalog_item(raw_item: Any, index: int) -> KoreanFoodCatalogItem:
    context = f"items[{index}]"

    if not isinstance(raw_item, dict):
        raise KoreanFoodCatalogValidationError(f"{context} must be an object.")

    catalog_id = _parse_required_string(raw_item, "id", context)
    canonical_name = _parse_required_string(raw_item, "canonicalName", context)
    brand_name = _parse_optional_string(raw_item, "brandName", context)
    category = _parse_required_string(raw_item, "category", context)
    aliases = _parse_aliases(raw_item.get("aliases"), context)
    match_strategy = _parse_match_strategy(raw_item.get("matchStrategy"), context)
    external_refs = _parse_external_refs(raw_item.get("externalRefs"), context)
    nutrition = _parse_catalog_nutrition(raw_item.get("nutrition"), context)
    nutrition_source = _parse_nutrition_source(raw_item.get("nutritionSource"), context)
    verification_status = _parse_verification_status(raw_item.get("verificationStatus"), context)

    if match_strategy in ("external_id", "provider_search") and len(external_refs) == 0:
        raise KoreanFoodCatalogValidationError(
            f"{context}.externalRefs must include at least one provider for {match_strategy}."
        )

    if match_strategy == "curated_nutrition":
        if nutrition is None:
            raise KoreanFoodCatalogValidationError(
                f"{context}.nutrition is required for curated_nutrition."
            )

        if nutrition_source is None:
            raise KoreanFoodCatalogValidationError(
                f"{context}.nutritionSource is required for curated_nutrition."
            )

        if verification_status is None:
            raise KoreanFoodCatalogValidationError(
                f"{context}.verificationStatus is required for curated_nutrition."
            )
    elif (
        nutrition is not None
        or nutrition_source is not None
        or verification_status is not None
    ):
        raise KoreanFoodCatalogValidationError(
            f"{context}.nutrition fields require matchStrategy curated_nutrition."
        )

    return KoreanFoodCatalogItem(
        id=catalog_id,
        canonical_name=canonical_name,
        brand_name=brand_name,
        category=category,
        aliases=aliases,
        match_strategy=match_strategy,
        external_refs=external_refs,
        nutrition=nutrition,
        nutrition_source=nutrition_source,
        verification_status=verification_status,
    )


def _parse_required_string(raw_item: dict[str, Any], field_name: str, context: str) -> str:
    raw_value = raw_item.get(field_name)

    if not isinstance(raw_value, str):
        raise KoreanFoodCatalogValidationError(f"{context}.{field_name} must be a string.")

    value = normalize_catalog_text(raw_value)

    if value == "":
        raise KoreanFoodCatalogValidationError(f"{context}.{field_name} cannot be empty.")

    return value


def _parse_optional_string(
    raw_item: dict[str, Any],
    field_name: str,
    context: str,
) -> str | None:
    if field_name not in raw_item:
        raise KoreanFoodCatalogValidationError(f"{context}.{field_name} is required.")

    raw_value = raw_item.get(field_name)

    if raw_value is None:
        return None

    if not isinstance(raw_value, str):
        raise KoreanFoodCatalogValidationError(
            f"{context}.{field_name} must be a string or null."
        )

    value = normalize_catalog_text(raw_value)

    if value == "":
        raise KoreanFoodCatalogValidationError(f"{context}.{field_name} cannot be empty.")

    return value


def _parse_optional_item_string(
    raw_item: dict[str, Any],
    field_name: str,
    context: str,
) -> str | None:
    if field_name not in raw_item:
        return None

    return _parse_optional_string(raw_item, field_name, context)


def _parse_aliases(raw_aliases: Any, context: str) -> tuple[str, ...]:
    if not isinstance(raw_aliases, list):
        raise KoreanFoodCatalogValidationError(f"{context}.aliases must be a list.")

    aliases: list[str] = []
    alias_keys: set[str] = set()

    for alias_index, raw_alias in enumerate(raw_aliases):
        if not isinstance(raw_alias, str):
            raise KoreanFoodCatalogValidationError(
                f"{context}.aliases[{alias_index}] must be a string."
            )

        alias = normalize_catalog_text(raw_alias)

        if alias == "":
            raise KoreanFoodCatalogValidationError(
                f"{context}.aliases[{alias_index}] cannot be empty."
            )

        alias_key = normalize_catalog_lookup_key(alias)

        if alias_key in alias_keys:
            continue

        alias_keys.add(alias_key)
        aliases.append(alias)

    if len(aliases) == 0:
        raise KoreanFoodCatalogValidationError(f"{context}.aliases cannot be empty.")

    return tuple(aliases)


def _parse_match_strategy(raw_match_strategy: Any, context: str) -> CatalogMatchStrategy:
    if not isinstance(raw_match_strategy, str):
        raise KoreanFoodCatalogValidationError(f"{context}.matchStrategy must be a string.")

    match_strategy = normalize_catalog_lookup_key(raw_match_strategy)

    if match_strategy not in VALID_MATCH_STRATEGIES:
        raise KoreanFoodCatalogValidationError(
            f"{context}.matchStrategy must be one of: "
            "external_id, provider_search, curated_nutrition."
        )

    return match_strategy  # type: ignore[return-value]


def _parse_external_refs(raw_external_refs: Any, context: str) -> tuple[ExternalFoodRef, ...]:
    if not isinstance(raw_external_refs, list):
        raise KoreanFoodCatalogValidationError(f"{context}.externalRefs must be a list.")

    return tuple(
        _parse_external_ref(raw_external_ref, context, ref_index)
        for ref_index, raw_external_ref in enumerate(raw_external_refs)
    )


def _parse_external_ref(raw_external_ref: Any, context: str, ref_index: int) -> ExternalFoodRef:
    ref_context = f"{context}.externalRefs[{ref_index}]"

    if not isinstance(raw_external_ref, dict):
        raise KoreanFoodCatalogValidationError(f"{ref_context} must be an object.")

    provider = _parse_required_string(raw_external_ref, "provider", ref_context)
    provider_key = normalize_catalog_lookup_key(provider)

    if provider_key not in KNOWN_EXTERNAL_PROVIDERS:
        raise KoreanFoodCatalogValidationError(f"{ref_context}.provider is unknown: {provider}")

    source_food_id = _parse_optional_string(raw_external_ref, "sourceFoodId", ref_context)
    source_serving_id = _parse_optional_string(raw_external_ref, "sourceServingId", ref_context)
    search_terms = _parse_search_terms(raw_external_ref.get("searchTerms"), ref_context)

    if source_serving_id is not None and source_food_id is None:
        raise KoreanFoodCatalogValidationError(
            f"{ref_context}.sourceServingId requires sourceFoodId."
        )

    return ExternalFoodRef(
        provider=provider_key,
        source_food_id=source_food_id,
        source_serving_id=source_serving_id,
        search_terms=search_terms,
    )


def _parse_search_terms(raw_search_terms: Any, context: str) -> tuple[str, ...]:
    if not isinstance(raw_search_terms, list):
        raise KoreanFoodCatalogValidationError(f"{context}.searchTerms must be a list.")

    search_terms: list[str] = []
    search_term_keys: set[str] = set()

    for search_term_index, raw_search_term in enumerate(raw_search_terms):
        if not isinstance(raw_search_term, str):
            raise KoreanFoodCatalogValidationError(
                f"{context}.searchTerms[{search_term_index}] must be a string."
            )

        search_term = normalize_catalog_text(raw_search_term)

        if search_term == "":
            raise KoreanFoodCatalogValidationError(
                f"{context}.searchTerms[{search_term_index}] cannot be empty."
            )

        search_term_key = normalize_catalog_lookup_key(search_term)

        if search_term_key in search_term_keys:
            raise KoreanFoodCatalogValidationError(
                f"{context}.searchTerms contains duplicate search term: {search_term}"
            )

        search_term_keys.add(search_term_key)
        search_terms.append(search_term)

    return tuple(search_terms)


def _parse_catalog_nutrition(raw_nutrition: Any, context: str) -> CatalogNutrition | None:
    if raw_nutrition is None:
        return None

    nutrition_context = f"{context}.nutrition"

    if not isinstance(raw_nutrition, dict):
        raise KoreanFoodCatalogValidationError(f"{nutrition_context} must be an object.")

    serving_size = _parse_required_positive_number(raw_nutrition, "servingSize", nutrition_context)
    serving_unit = _parse_required_string(raw_nutrition, "servingUnit", nutrition_context)

    return CatalogNutrition(
        serving_size=serving_size,
        serving_unit=serving_unit,
        calories_kcal=_parse_nullable_non_negative_number(
            raw_nutrition,
            "caloriesKcal",
            nutrition_context,
        ),
        protein_g=_parse_nullable_non_negative_number(
            raw_nutrition,
            "proteinG",
            nutrition_context,
        ),
        carbs_g=_parse_nullable_non_negative_number(
            raw_nutrition,
            "carbsG",
            nutrition_context,
        ),
        fat_g=_parse_nullable_non_negative_number(
            raw_nutrition,
            "fatG",
            nutrition_context,
        ),
    )


def _parse_nutrition_source(raw_source: Any, context: str) -> CatalogNutritionSource | None:
    if raw_source is None:
        return None

    source_context = f"{context}.nutritionSource"

    if not isinstance(raw_source, dict):
        raise KoreanFoodCatalogValidationError(f"{source_context} must be an object.")

    source_type = _parse_required_string(raw_source, "type", source_context)
    normalized_source_type = normalize_catalog_lookup_key(source_type)

    if normalized_source_type not in VALID_NUTRITION_SOURCE_TYPES:
        raise KoreanFoodCatalogValidationError(
            f"{source_context}.type must be one of: mfds, brand_official, manufacturer, other."
        )

    return CatalogNutritionSource(
        source_type=normalized_source_type,  # type: ignore[arg-type]
        name=_parse_required_string(raw_source, "name", source_context),
        url=_parse_optional_string(raw_source, "url", source_context),
        record_id=_parse_optional_string(raw_source, "recordId", source_context),
        checked_at=_parse_required_string(raw_source, "checkedAt", source_context),
    )


def _parse_verification_status(raw_status: Any, context: str) -> CatalogVerificationStatus | None:
    if raw_status is None:
        return None

    if not isinstance(raw_status, str):
        raise KoreanFoodCatalogValidationError(f"{context}.verificationStatus must be a string.")

    verification_status = normalize_catalog_lookup_key(raw_status)

    if verification_status not in VALID_VERIFICATION_STATUSES:
        raise KoreanFoodCatalogValidationError(
            f"{context}.verificationStatus must be one of: "
            "official, reviewed, estimated, needs_verification."
        )

    return verification_status  # type: ignore[return-value]


def _parse_required_positive_number(
    raw_item: dict[str, Any],
    field_name: str,
    context: str,
) -> float:
    if field_name not in raw_item:
        raise KoreanFoodCatalogValidationError(f"{context}.{field_name} is required.")

    value = _parse_number(raw_item.get(field_name), f"{context}.{field_name}")

    if value is None or value <= 0:
        raise KoreanFoodCatalogValidationError(f"{context}.{field_name} must be greater than 0.")

    return value


def _parse_nullable_non_negative_number(
    raw_item: dict[str, Any],
    field_name: str,
    context: str,
) -> float | None:
    if field_name not in raw_item:
        raise KoreanFoodCatalogValidationError(f"{context}.{field_name} is required.")

    raw_value = raw_item.get(field_name)

    if raw_value is None:
        return None

    value = _parse_number(raw_value, f"{context}.{field_name}")

    if value is None or value < 0:
        raise KoreanFoodCatalogValidationError(
            f"{context}.{field_name} must be a non-negative number or null."
        )

    return value


def _parse_number(raw_value: Any, field_context: str) -> float | None:
    if isinstance(raw_value, bool):
        raise KoreanFoodCatalogValidationError(f"{field_context} must be a number.")

    if isinstance(raw_value, int | float):
        value = float(raw_value)

        if math.isfinite(value):
            return value

    raise KoreanFoodCatalogValidationError(f"{field_context} must be a finite number.")


@lru_cache
def get_korean_food_catalog() -> KoreanFoodCatalog:
    return KoreanFoodCatalog.from_catalog_file()