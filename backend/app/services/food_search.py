from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache

from app.models.food import FoodSearchRecord, NutritionSourceMetadata
from app.providers.factory import get_food_provider, get_kfind_food_provider
from app.providers.interfaces import (
    FoodProvider,
    FoodSearchProviderLocalization,
    FoodSearchProviderResponse,
    ProviderName,
)
from app.services.korean_food_catalog import (
    CatalogNutritionSource,
    ExternalFoodRef,
    KoreanFoodCatalog,
    KoreanFoodCatalogItem,
    get_korean_food_catalog,
)
from app.providers.kfind import KFIND_DATA_SOURCE, KFIND_SEARCH_LOCALIZATION
from app.services.provider_fallback import (
    provider_failure_fallback_decision,
    provider_response_fallback_decision,
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
        primary_search_provider_factory: Callable[[], FoodProvider] | None = None,
        primary_search_provider_name: ProviderName | None = None,
        primary_search_localization: FoodSearchProviderLocalization | None = None,
    ) -> None:
        self._provider = provider
        self._query_translator = query_translator
        self._identity_translator = identity_translator or IdentityQueryTranslator()
        self._korean_food_catalog = korean_food_catalog or get_korean_food_catalog()
        self._primary_search_provider_factory = primary_search_provider_factory
        self._primary_search_provider_name = primary_search_provider_name
        self._search_localization = primary_search_localization or provider.search_localization

    async def search_foods(
        self,
        query: str,
        page: int,
        page_size: int,
    ) -> FoodSearchServiceResponse:
        normalized_query = normalize_query_spacing(query)
        primary_search_enabled = self._primary_search_provider_factory is not None
        normalized_page_size = self._normalize_provider_page_size(page_size)
        catalog_response = await self._search_catalog_foods(
            normalized_query,
            page,
            normalized_page_size,
            include_provider_routes=not primary_search_enabled,
            localization=self._search_localization,
        )

        if catalog_response is not None:
            return catalog_response

        query_resolution = self._resolve_query(normalized_query, self._search_localization)

        if query_resolution.status == "unresolved":
            return FoodSearchServiceResponse(
                items=[],
                page=page,
                page_size=normalized_page_size,
                has_more=False,
                query=query_resolution,
            )

        if primary_search_enabled:
            return await self._search_provider_chain(
                primary_query=query_resolution.resolved,
                primary_query_resolution=query_resolution,
                fallback_query=normalized_query,
                page=page,
                requested_page_size=page_size,
                primary_page_size=normalized_page_size,
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

    async def _search_provider_chain(
        self,
        *,
        primary_query: str,
        primary_query_resolution: FoodSearchQueryTranslation,
        fallback_query: str,
        page: int,
        requested_page_size: int,
        primary_page_size: int,
    ) -> FoodSearchServiceResponse:
        primary_provider_factory = self._primary_search_provider_factory

        if primary_provider_factory is None:
            raise RuntimeError("primary search provider is not configured.")

        provider_name = self._primary_search_provider_name or self._provider.provider_name

        try:
            primary_provider = primary_provider_factory()
            provider_name = primary_provider.provider_name
            primary_response = await primary_provider.search_foods(
                primary_query,
                page,
                primary_page_size,
            )
        except Exception as error:
            decision = provider_failure_fallback_decision(provider_name, error)

            if not decision.should_fallback:
                raise

            return await self._search_fallback_provider(
                fallback_query,
                page,
                requested_page_size,
            )

        decision = provider_response_fallback_decision(
            primary_provider.provider_name,
            primary_response.items,
            operation="search",
        )

        if decision.should_fallback:
            return await self._search_fallback_provider(
                fallback_query,
                page,
                requested_page_size,
            )

        return FoodSearchServiceResponse(
            items=primary_response.items,
            page=primary_response.page,
            page_size=primary_response.page_size,
            has_more=primary_response.has_more,
            query=(
                primary_query_resolution
                if primary_query_resolution.should_include_response_metadata
                else None
            ),
        )

    async def _search_fallback_provider(
        self,
        normalized_query: str,
        page: int,
        page_size: int,
    ) -> FoodSearchServiceResponse:
        fallback_localization = self._provider.search_localization
        normalized_page_size = self._normalize_provider_page_size(
            page_size,
            fallback_localization,
        )
        catalog_response = await self._search_catalog_foods(
            normalized_query,
            page,
            normalized_page_size,
            include_provider_routes=True,
            localization=fallback_localization,
        )

        if catalog_response is not None:
            return catalog_response

        query_resolution = self._resolve_query(normalized_query, fallback_localization)

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
        *,
        include_provider_routes: bool = True,
        localization: FoodSearchProviderLocalization | None = None,
    ) -> FoodSearchServiceResponse | None:
        catalog_item = self._korean_food_catalog.resolve(normalized_query)

        if catalog_item is None:
            return None

        resolved_localization = localization or self._search_localization
        curated_response = self._curated_nutrition_response(catalog_item, page, page_size)

        if curated_response is not None:
            return curated_response

        if not include_provider_routes:
            return None

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
            resolved_localization,
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
        localization: FoodSearchProviderLocalization,
    ) -> FoodSearchServiceResponse:
        return FoodSearchServiceResponse(
            items=[],
            page=page,
            page_size=page_size,
            has_more=False,
            query=(
                self._unresolved_catalog_query(
                    normalized_query,
                    catalog_item,
                    localization,
                )
                if self._should_return_unresolved_catalog_query(
                    normalized_query,
                    localization,
                )
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

    def _should_return_unresolved_catalog_query(
        self,
        normalized_query: str,
        localization: FoodSearchProviderLocalization,
    ) -> bool:
        return (
            contains_hangul(normalized_query)
            and not localization.supports_korean_query
            and localization.requires_english_alias_for_korean_query
        )

    def _unresolved_catalog_query(
        self,
        normalized_query: str,
        catalog_item: KoreanFoodCatalogItem,
        localization: FoodSearchProviderLocalization,
    ) -> FoodSearchQueryTranslation:
        return FoodSearchQueryTranslation(
            original=normalized_query,
            resolved=catalog_item.canonical_name,
            was_translated=False,
            translator_name=CATALOG_TRANSLATOR_NAME,
            status="unresolved",
            source_language="ko" if contains_hangul(normalized_query) else "auto",
            target_language=localization.language,
        )

    def _resolve_query(
        self,
        query: str,
        localization: FoodSearchProviderLocalization | None = None,
    ) -> FoodSearchQueryTranslation:
        normalized_query = normalize_query_spacing(query)
        resolved_localization = localization or self._search_localization

        if (
            contains_hangul(normalized_query)
            and not resolved_localization.supports_korean_query
            and resolved_localization.requires_english_alias_for_korean_query
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
            target_language=resolved_localization.language,
        )

    def _normalize_provider_page_size(
        self,
        page_size: int,
        localization: FoodSearchProviderLocalization | None = None,
    ) -> int:
        resolved_localization = localization or self._search_localization
        max_page_size = resolved_localization.max_page_size

        if max_page_size is None:
            return page_size

        return min(page_size, max_page_size)


@lru_cache
def get_food_search_query_translator() -> FoodSearchQueryTranslator:
    return KoreanFoodAliasTranslator.from_alias_file()


def get_food_search_service() -> FoodSearchService:
    provider = get_food_provider()
    uses_fatsecret_provider = provider.provider_name == "fatsecret"

    return FoodSearchService(
        provider=provider,
        query_translator=get_food_search_query_translator(),
        korean_food_catalog=get_korean_food_catalog(),
        primary_search_provider_factory=(
            get_kfind_food_provider if uses_fatsecret_provider else None
        ),
        primary_search_provider_name=(KFIND_DATA_SOURCE if uses_fatsecret_provider else None),
        primary_search_localization=(
            KFIND_SEARCH_LOCALIZATION if uses_fatsecret_provider else None
        ),
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