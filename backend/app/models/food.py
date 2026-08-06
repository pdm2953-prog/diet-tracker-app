from pydantic import BaseModel, Field


class FoodSearchRecord(BaseModel):
    id: str
    name: str
    brand_name: str | None
    serving_size: float | None = Field(ge=0)
    serving_unit: str | None
    calories_kcal: float | None = Field(ge=0)
    protein_g: float | None = Field(ge=0)
    carbs_g: float | None = Field(ge=0)
    fat_g: float | None = Field(ge=0)
    keywords: tuple[str, ...] = ()

    @property
    def search_text(self) -> str:
        searchable_values = (
            self.name,
            self.brand_name,
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
    brandName: str | None
    servingSize: float | None = Field(default=None, ge=0)
    servingUnit: str | None
    nutritionPerServing: NutritionPerServingDto

    @classmethod
    def from_record(cls, record: FoodSearchRecord) -> "FoodSearchItemDto":
        return cls(
            id=record.id,
            name=record.name,
            brandName=record.brand_name,
            servingSize=record.serving_size,
            servingUnit=record.serving_unit,
            nutritionPerServing=NutritionPerServingDto(
                caloriesKcal=record.calories_kcal,
                proteinG=record.protein_g,
                carbsG=record.carbs_g,
                fatG=record.fat_g,
            ),
        )


class FoodSearchResponseDto(BaseModel):
    items: list[FoodSearchItemDto]
    page: int = Field(ge=1)
    pageSize: int = Field(ge=1)
    hasMore: bool
