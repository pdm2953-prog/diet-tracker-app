from typing import Literal

from pydantic import BaseModel, Field


FoodDataSource = str
FoodSearchQueryStatus = Literal["identity", "translated", "unresolved"]


class NutritionSourceMetadata(BaseModel):
    type: str
    name: str
    url: str | None = None
    record_id: str | None = None
    checked_at: str


class NutritionSourceDto(BaseModel):
    type: str
    name: str
    url: str | None = None
    recordId: str | None = None
    checkedAt: str

    @classmethod
    def from_metadata(cls, metadata: NutritionSourceMetadata) -> "NutritionSourceDto":
        return cls(
            type=metadata.type,
            name=metadata.name,
            url=metadata.url,
            recordId=metadata.record_id,
            checkedAt=metadata.checked_at,
        )


class FoodSearchRecord(BaseModel):
    id: str
    data_source: FoodDataSource
    source_food_id: str | None = None
    source_food_name: str | None = None
    source_serving_id: str | None = None
    name: str
    display_name: str | None = None
    brand_name: str | None
    category: str | None = None
    catalog_id: str | None = None
    canonical_name: str | None = None
    serving_description: str | None = None
    serving_size: float | None = Field(default=None, ge=0)
    serving_unit: str | None
    calories_kcal: float | None = Field(default=None, ge=0)
    protein_g: float | None = Field(default=None, ge=0)
    carbs_g: float | None = Field(default=None, ge=0)
    fat_g: float | None = Field(default=None, ge=0)
    source_region: str | None = None
    nutrition_source: NutritionSourceMetadata | None = None
    verification_status: str | None = None
    keywords: tuple[str, ...] = ()

    @property
    def search_text(self) -> str:
        searchable_values = (
            self.name,
            self.brand_name,
            self.category,
            self.catalog_id,
            self.canonical_name,
            self.source_food_id,
            self.source_food_name,
            self.source_serving_id,
            self.serving_description,
            self.verification_status,
            self.nutrition_source.name if self.nutrition_source is not None else None,
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
    category: str | None = None
    catalogId: str | None = None
    canonicalName: str | None = None
    servingSize: float | None = Field(default=None, ge=0)
    servingUnit: str | None
    nutritionPerServing: NutritionPerServingDto
    dataSource: FoodDataSource | None = None
    sourceFoodId: str | None = None
    sourceFoodName: str | None = None
    sourceServingId: str | None = None
    servingDescription: str | None = None
    sourceRegion: str | None = None
    nutritionSource: NutritionSourceDto | None = None
    verificationStatus: str | None = None
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
            displayName=(
                display_name if display_name is not None else record.display_name
            ),
            brandName=record.brand_name,
            category=record.category,
            catalogId=record.catalog_id,
            canonicalName=record.canonical_name,
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
            nutritionSource=(
                NutritionSourceDto.from_metadata(record.nutrition_source)
                if record.nutrition_source is not None
                else None
            ),
            verificationStatus=record.verification_status,
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
