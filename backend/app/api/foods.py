from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.models.food import FoodSearchItemDto, FoodSearchQueryDto, FoodSearchResponseDto
from app.services.food_search import FoodSearchService, get_food_search_service
from app.services.query_translation import FoodSearchQueryTranslation

router = APIRouter(prefix="/foods", tags=["foods"])


@router.get("/search", response_model=FoodSearchResponseDto)
async def search_foods(
    q: Annotated[str, Query(description="Food name search text")],
    service: Annotated[FoodSearchService, Depends(get_food_search_service)],
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
        items=[FoodSearchItemDto.from_record(food) for food in service_response.items],
        page=service_response.page,
        pageSize=service_response.page_size,
        hasMore=service_response.has_more,
        query=_query_dto_from_translation(service_response.query),
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
