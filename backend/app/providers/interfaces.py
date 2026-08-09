from dataclasses import dataclass
from typing import Protocol

from app.models.food import FoodSearchRecord


ProviderName = str


@dataclass(frozen=True)
class FoodSearchProviderLocalization:
    region: str | None
    language: str
    supports_korean_query: bool
    requires_english_alias_for_korean_query: bool
    max_page_size: int | None = None


@dataclass(frozen=True)
class FoodSearchProviderResponse:
    items: list[FoodSearchRecord]
    page: int
    page_size: int
    has_more: bool


class FoodProvider(Protocol):
    @property
    def provider_name(self) -> ProviderName:
        raise NotImplementedError

    @property
    def search_localization(self) -> FoodSearchProviderLocalization:
        raise NotImplementedError

    async def search_foods(
        self,
        query: str,
        page: int,
        page_size: int,
    ) -> FoodSearchProviderResponse:
        raise NotImplementedError

    async def get_food(
        self,
        food_id: str,
        serving_id: str | None = None,
    ) -> FoodSearchRecord | None:
        raise NotImplementedError
