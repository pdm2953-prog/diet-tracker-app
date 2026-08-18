from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.models.food import (
    FoodSearchItemDto,
    FoodSearchQueryDto,
    FoodSearchRecord,
    FoodSearchResponseDto,
)
from app.services.food_search import FoodSearchService, get_food_search_service
from app.services.food_name_localization import FoodNameLocalizer, get_food_name_localizer
from app.services.query_translation import FoodSearchQueryTranslation

router = APIRouter(prefix="/foods", tags=["foods"])


@router.get("/search", response_model=FoodSearchResponseDto)
async def search_foods(
    q: Annotated[str, Query(description="Food name search text")],
    service: Annotated[FoodSearchService, Depends(get_food_search_service)],
    food_name_localizer: Annotated[FoodNameLocalizer, Depends(get_food_name_localizer)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=50)] = 20,
) -> FoodSearchResponseDto:
    normalized_query = q.strip()

    if len(normalized_query) < 2:
        raise HTTPException(
            status_code=422,
            detail="q must contain at least 2 non-whitespace characters.",
        )

    service_response = await service.search_foods(
        normalized_query,
        page,
        page_size,
    )

    return FoodSearchResponseDto(
        items=[
            _food_item_dto_from_record(food, food_name_localizer)
            for food in service_response.items
        ],
        page=service_response.page,
        pageSize=service_response.page_size,
        hasMore=service_response.has_more,
        query=_query_dto_from_translation(service_response.query),
    )


def _food_item_dto_from_record(
    record: FoodSearchRecord,
    food_name_localizer: FoodNameLocalizer,
) -> FoodSearchItemDto:
    source_food_name = record.source_food_name or record.name
    localization = food_name_localizer.localize(source_food_name)
    display_name = record.canonical_name or record.display_name or localization.display_name
    was_localized = localization.was_localized
    display_locale = localization.display_locale
    localizer_name = localization.localizer_name

    if record.canonical_name is not None:
        was_localized = True
        display_locale = "ko-KR"
        localizer_name = "korean_food_catalog"

    return FoodSearchItemDto.from_record(
        record,
        display_name=display_name,
        was_localized=was_localized,
        display_locale=display_locale,
        localizer=localizer_name,
    )


def _query_dto_from_translation(
    query: FoodSearchQueryTranslation | None,
) -> FoodSearchQueryDto | None:
    if query is None:
        return None

    return FoodSearchQueryDto(
        original=query.original,
        resolved=query.resolved,
        wasTranslated=query.was_translated,
        translator=query.translator_name,
        status=query.status,
    )
