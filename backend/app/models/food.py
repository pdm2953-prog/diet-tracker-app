from typing import Literal

from pydantic import BaseModel, Field


FoodDataSource = str
FoodSearchQueryStatus = Literal["identity", "translated", "unresolved"]


class FoodSearchRecord(BaseModel):
    id: str
    data_source: FoodDataSource
    source_food_id: str | None = None
    source_food_name: str | None = None
    source_serving_id: str | None = None
    name: str
    brand_name: str | None
    serving_description: str | None = None
    serving_size: float | None = Field(default=None, ge=0)
    serving_unit: str | None
    calories_kcal: float | None = Field(default=None, ge=0)
    protein_g: float | None = Field(default=None, ge=0)
    carbs_g: float | None = Field(default=None, ge=0)
    fat_g: float | None = Field(default=None, ge=0)
    source_region: str | None = None
    keywords: tuple[str, ...] = ()

    @property
    def search_text(self) -> str:
        searchable_values = (
            self.name,
            self.brand_name,
            self.source_food_id,
            self.source_food_name,
            self.source_serving_id,
            self.serving_description,
            *self.keywords,
        )

        return " ".join(
            value.casefold()
            for value in searchable_values
            if isinstance(value, str)
        )


class NutritionPerServingDto(BaseModel):
    caloriesKcal: float | None = Field(default=None, ge=0)
    proteinG: float | None = Field(default=None, ge=0)
    carbsG: float | None = Field(default=None, ge=0)
    fatG: float | None = Field(default=None, ge=0)


class FoodSearchItemDto(BaseModel):
    id: str
    name: str
    displayName: str | None = None
    brandName: str | None
    servingSize: float | None = Field(default=None, ge=0)
    servingUnit: str | None
    nutritionPerServing: NutritionPerServingDto
    dataSource: FoodDataSource | None = None
    sourceFoodId: str | None = None
    sourceFoodName: str | None = None
    sourceServingId: str | None = None
    servingDescription: str | None = None
    sourceRegion: str | None = None
    wasLocalized: bool | None = None
    displayLocale: str | None = None
    localizer: str | None = None

    @classmethod
    def from_record(
        cls,
        record: FoodSearchRecord,
        *,
        display_name: str | None = None,
        was_localized: bool | None = None,
        display_locale: str | None = None,
        localizer: str | None = None,
    ) -> "FoodSearchItemDto":
        return cls(
            id=record.id,
            name=record.name,
            displayName=display_name,
            brandName=record.brand_name,
            servingSize=record.serving_size,
            servingUnit=record.serving_unit,
            nutritionPerServing=NutritionPerServingDto(
                caloriesKcal=record.calories_kcal,
                proteinG=record.protein_g,
                carbsG=record.carbs_g,
                fatG=record.fat_g,
            ),
            dataSource=record.data_source,
            sourceFoodId=record.source_food_id,
            sourceFoodName=record.source_food_name,
            sourceServingId=record.source_serving_id,
            servingDescription=record.serving_description,
            sourceRegion=record.source_region,
            wasLocalized=was_localized,
            displayLocale=display_locale,
            localizer=localizer,
        )


class FoodSearchQueryDto(BaseModel):
    original: str
    resolved: str
    wasTranslated: bool
    translator: str
    status: FoodSearchQueryStatus


class FoodSearchResponseDto(BaseModel):
    items: list[FoodSearchItemDto]
    page: int = Field(ge=1)
    pageSize: int = Field(ge=1)
    hasMore: bool
    query: FoodSearchQueryDto | None = None
