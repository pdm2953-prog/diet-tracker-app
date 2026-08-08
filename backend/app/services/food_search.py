from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

from app.models.food import FoodSearchRecord
from app.providers.factory import get_food_provider
from app.providers.interfaces import FoodProvider
from app.services.query_translation import (
    FoodSearchQueryTranslation,
    FoodSearchQueryTranslator,
    IdentityQueryTranslator,
    KoreanFoodAliasTranslator,
    contains_hangul,
    normalize_query_spacing,
)


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
    ) -> None:
        self._provider = provider
        self._query_translator = query_translator
        self._identity_translator = identity_translator or IdentityQueryTranslator()

    async def search_foods(
        self,
        query: str,
        page: int,
        page_size: int,
    ) -> FoodSearchServiceResponse:
        query_resolution = self._resolve_query(query)
        normalized_page_size = self._normalize_provider_page_size(page_size)

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
    )
