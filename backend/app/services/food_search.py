from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

from app.models.food import FoodSearchRecord, NutritionSourceMetadata
from app.providers.factory import get_food_provider
from app.providers.interfaces import FoodProvider, FoodSearchProviderResponse
from app.services.korean_food_catalog import (
    CatalogNutritionSource,
    ExternalFoodRef,
    KoreanFoodCatalog,
    KoreanFoodCatalogItem,
    get_korean_food_catalog,
)
from app.services.query_translation import (
    FoodSearchQueryTranslation,
    FoodSearchQueryTranslator,
    IdentityQueryTranslator,
    KoreanFoodAliasTranslator,
    contains_hangul,
    normalize_query_spacing,
)


CATALOG_TRANSLATOR_NAME = "korean_food_catalog"


@dataclass(frozen=True)
class FoodSearchServiceResponse:
    items: list[FoodSearchRecord]
    page: int
    page_size: int
    has_more: bool
    query: FoodSearchQueryTranslation | None = None


class FoodSearchService:
    def __init__(
        self,
        provider: FoodProvider,
        query_translator: FoodSearchQueryTranslator,
        identity_translator: FoodSearchQueryTranslator | None = None,
        korean_food_catalog: KoreanFoodCatalog | None = None,
    ) -> None:
        self._provider = provider
        self._query_translator = query_translator
        self._identity_translator = identity_translator or IdentityQueryTranslator()
        self._korean_food_catalog = korean_food_catalog or get_korean_food_catalog()

    async def search_foods(
        self,
        query: str,
        page: int,
        page_size: int,
    ) -> FoodSearchServiceResponse:
        normalized_query = normalize_query_spacing(query)
        normalized_page_size = self._normalize_provider_page_size(page_size)
        catalog_response = await self._search_catalog_foods(
            normalized_query,
            page,
            normalized_page_size,
        )

        if catalog_response is not None:
            return catalog_response

        query_resolution = self._resolve_query(normalized_query)

        if query_resolution.status == "unresolved":
            return FoodSearchServiceResponse(
                items=[],
                page=page,
                page_size=normalized_page_size,
                has_more=False,
                query=query_resolution,
            )

        provider_response = await self._provider.search_foods(
            query_resolution.resolved,
            page,
            normalized_page_size,
        )

        return FoodSearchServiceResponse(
            items=provider_response.items,
            page=provider_response.page,
            page_size=provider_response.page_size,
            has_more=provider_response.has_more,
            query=(
                query_resolution
                if query_resolution.should_include_response_metadata
                else None
            ),
        )

    async def _search_catalog_foods(
        self,
        normalized_query: str,
        page: int,
        page_size: int,
    ) -> FoodSearchServiceResponse | None:
        catalog_item = self._korean_food_catalog.resolve(normalized_query)

        if catalog_item is None:
            return None

        curated_response = self._curated_nutrition_response(catalog_item, page, page_size)

        if curated_response is not None:
            return curated_response

        provider_refs = catalog_item.refs_for_provider(self._provider.provider_name)
        direct_ref = self._select_direct_ref(catalog_item, provider_refs)

        if direct_ref is not None:
            if page > 1:
                return FoodSearchServiceResponse(
                    items=[],
                    page=page,
                    page_size=page_size,
                    has_more=False,
                )

            direct_record = await self._provider.get_food(
                direct_ref.source_food_id or "",
                direct_ref.source_serving_id,
            )

            if direct_record is not None:
                return FoodSearchServiceResponse(
                    items=[self._with_catalog_context(direct_record, catalog_item)],
                    page=page,
                    page_size=page_size,
                    has_more=False,
                )

        search_ref = self._select_search_ref(catalog_item, provider_refs)

        if search_ref is not None:
            provider_response = await self._provider.search_foods(
                search_ref.search_terms[0],
                page,
                page_size,
            )

            return self._catalog_provider_response(provider_response, catalog_item)

        return self._unresolved_catalog_response(
            normalized_query,
            catalog_item,
            page,
            page_size,
        )

    def _curated_nutrition_response(
        self,
        catalog_item: KoreanFoodCatalogItem,
        page: int,
        page_size: int,
    ) -> FoodSearchServiceResponse | None:
        if not catalog_item.has_usable_curated_nutrition:
            return None

        if page > 1:
            return FoodSearchServiceResponse(
                items=[],
                page=page,
                page_size=page_size,
                has_more=False,
            )

        return FoodSearchServiceResponse(
            items=[self._record_from_curated_catalog_item(catalog_item)],
            page=page,
            page_size=page_size,
            has_more=False,
        )

    def _record_from_curated_catalog_item(
        self,
        catalog_item: KoreanFoodCatalogItem,
    ) -> FoodSearchRecord:
        nutrition = catalog_item.nutrition
        nutrition_source = catalog_item.nutrition_source

        if nutrition is None or nutrition_source is None:
            raise ValueError("curated catalog item requires nutrition and nutrition source")

        return FoodSearchRecord(
            id=f"curated-{catalog_item.id}",
            data_source="curated",
            source_food_id=catalog_item.id,
            source_food_name=catalog_item.canonical_name,
            name=catalog_item.canonical_name,
            brand_name=catalog_item.brand_name,
            category=catalog_item.category,
            catalog_id=catalog_item.id,
            canonical_name=catalog_item.canonical_name,
            serving_description=f"{_format_number(nutrition.serving_size)} {nutrition.serving_unit}",
            serving_size=nutrition.serving_size,
            serving_unit=nutrition.serving_unit,
            calories_kcal=nutrition.calories_kcal,
            protein_g=nutrition.protein_g,
            carbs_g=nutrition.carbs_g,
            fat_g=nutrition.fat_g,
            source_region="KR",
            nutrition_source=_nutrition_source_metadata(nutrition_source),
            verification_status=catalog_item.verification_status,
        )

    def _select_direct_ref(
        self,
        catalog_item: KoreanFoodCatalogItem,
        provider_refs: tuple[ExternalFoodRef, ...],
    ) -> ExternalFoodRef | None:
        if catalog_item.match_strategy != "external_id":
            return None

        return next(
            (external_ref for external_ref in provider_refs if external_ref.has_source_food_id),
            None,
        )

    def _select_search_ref(
        self,
        catalog_item: KoreanFoodCatalogItem,
        provider_refs: tuple[ExternalFoodRef, ...],
    ) -> ExternalFoodRef | None:
        if catalog_item.match_strategy != "provider_search":
            return None

        return next(
            (external_ref for external_ref in provider_refs if external_ref.has_search_terms),
            None,
        )

    def _catalog_provider_response(
        self,
        provider_response: FoodSearchProviderResponse,
        catalog_item: KoreanFoodCatalogItem,
    ) -> FoodSearchServiceResponse:
        return FoodSearchServiceResponse(
            items=[
                self._with_catalog_context(provider_record, catalog_item)
                for provider_record in provider_response.items
            ],
            page=provider_response.page,
            page_size=provider_response.page_size,
            has_more=provider_response.has_more,
        )

    def _unresolved_catalog_response(
        self,
        normalized_query: str,
        catalog_item: KoreanFoodCatalogItem,
        page: int,
        page_size: int,
    ) -> FoodSearchServiceResponse:
        return FoodSearchServiceResponse(
            items=[],
            page=page,
            page_size=page_size,
            has_more=False,
            query=(
                self._unresolved_catalog_query(normalized_query, catalog_item)
                if self._should_return_unresolved_catalog_query(normalized_query)
                else None
            ),
        )

    def _with_catalog_context(
        self,
        record: FoodSearchRecord,
        catalog_item: KoreanFoodCatalogItem,
    ) -> FoodSearchRecord:
        return record.model_copy(update={
            "brand_name": catalog_item.brand_name or record.brand_name,
            "category": catalog_item.category,
            "catalog_id": catalog_item.id,
            "canonical_name": catalog_item.canonical_name,
        })

    def _should_return_unresolved_catalog_query(self, normalized_query: str) -> bool:
        localization = self._provider.search_localization

        return (
            contains_hangul(normalized_query)
            and not localization.supports_korean_query
            and localization.requires_english_alias_for_korean_query
        )

    def _unresolved_catalog_query(
        self,
        normalized_query: str,
        catalog_item: KoreanFoodCatalogItem,
    ) -> FoodSearchQueryTranslation:
        localization = self._provider.search_localization

        return FoodSearchQueryTranslation(
            original=normalized_query,
            resolved=catalog_item.canonical_name,
            was_translated=False,
            translator_name=CATALOG_TRANSLATOR_NAME,
            status="unresolved",
            source_language="ko" if contains_hangul(normalized_query) else "auto",
            target_language=localization.language,
        )

    def _resolve_query(self, query: str) -> FoodSearchQueryTranslation:
        normalized_query = normalize_query_spacing(query)
        localization = self._provider.search_localization

        if (
            contains_hangul(normalized_query)
            and not localization.supports_korean_query
            and localization.requires_english_alias_for_korean_query
        ):
            return self._query_translator.translate(
                normalized_query,
                source_language="ko",
                target_language="en",
            )

        source_language = "ko" if contains_hangul(normalized_query) else "auto"

        return self._identity_translator.translate(
            normalized_query,
            source_language=source_language,
            target_language=localization.language,
        )

    def _normalize_provider_page_size(self, page_size: int) -> int:
        max_page_size = self._provider.search_localization.max_page_size

        if max_page_size is None:
            return page_size

        return min(page_size, max_page_size)


@lru_cache
def get_food_search_query_translator() -> FoodSearchQueryTranslator:
    return KoreanFoodAliasTranslator.from_alias_file()


def get_food_search_service() -> FoodSearchService:
    return FoodSearchService(
        provider=get_food_provider(),
        query_translator=get_food_search_query_translator(),
        korean_food_catalog=get_korean_food_catalog(),
    )


def _nutrition_source_metadata(source: CatalogNutritionSource) -> NutritionSourceMetadata:
    return NutritionSourceMetadata(
        type=source.source_type,
        name=source.name,
        url=source.url,
        record_id=source.record_id,
        checked_at=source.checked_at,
    )


def _format_number(value: float) -> str:
    return str(int(value)) if value.is_integer() else f"{value:g}"