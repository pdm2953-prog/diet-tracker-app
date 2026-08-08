import type {
  Food,
  FoodDataSource,
  FoodSearchQueryMetadata,
  FoodSearchQueryStatus,
} from '../models';
import { parseOptionalFoodDataSource } from '../utils/foodDataSource';

export type BackendFoodNutritionPerServingDto = {
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
};

export type BackendFoodSearchItemDto = {
  id: string;
  name: string;
  displayName?: string;
  brandName: string | null;
  servingSize: number | null;
  servingUnit: string | null;
  nutritionPerServing: BackendFoodNutritionPerServingDto;
  dataSource?: FoodDataSource;
  sourceFoodId?: string;
  sourceFoodName?: string;
  sourceServingId?: string;
  servingDescription?: string;
  sourceRegion?: string;
  wasLocalized?: boolean;
  displayLocale?: string;
  localizer?: string;
};

export type BackendFoodSearchResponseDto = {
  items: BackendFoodSearchItemDto[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  query?: FoodSearchQueryMetadata;
};

export type AdaptBackendFoodOptions = {
  updatedAt?: string;
};

export function parseBackendFoodSearchResponse(
  value: unknown,
): BackendFoodSearchResponseDto | null {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return null;
  }

  const query = parseOptionalBackendFoodSearchQuery(value.query);

  if (
    !isPositiveInteger(value.page)
    || !isPositiveInteger(value.pageSize)
    || typeof value.hasMore !== 'boolean'
    || query === null
  ) {
    return null;
  }

  const items = value.items.map(parseBackendFoodSearchItem);

  if (items.some((item) => item === null)) {
    return null;
  }

  return {
    items: items as BackendFoodSearchItemDto[],
    page: value.page,
    pageSize: value.pageSize,
    hasMore: value.hasMore,
    ...(query !== undefined ? { query } : {}),
  };
}

export function adaptBackendFoodSearchResponse(
  dto: BackendFoodSearchResponseDto,
  options: AdaptBackendFoodOptions = {},
): {
  items: Food[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  query?: FoodSearchQueryMetadata;
} {
  return {
    items: dto.items.map((item) => adaptBackendFoodSearchItem(item, options)),
    page: dto.page,
    pageSize: dto.pageSize,
    hasMore: dto.hasMore,
    ...(dto.query !== undefined ? { query: dto.query } : {}),
  };
}

export function adaptBackendFoodSearchItem(
  dto: BackendFoodSearchItemDto,
  options: AdaptBackendFoodOptions = {},
): Food {
  const food: Food = {
    id: dto.id,
    source: 'backend-food-search',
    sourceFoodId: dto.sourceFoodId ?? dto.id,
    name: dto.name,
    brandName: dto.brandName,
    category: null,
    servingSize: dto.servingSize,
    servingUnit: dto.servingUnit,
    nutritionPerServing: {
      caloriesKcal: dto.nutritionPerServing.caloriesKcal,
      carbohydrateG: dto.nutritionPerServing.carbsG,
      proteinG: dto.nutritionPerServing.proteinG,
      fatG: dto.nutritionPerServing.fatG,
      sugarsG: null,
      sodiumMg: null,
      fiberG: null,
      saturatedFatG: null,
      transFatG: null,
      cholesterolMg: null,
    },
    updatedAt: options.updatedAt ?? new Date().toISOString(),
  };

  if (dto.dataSource !== undefined) {
    food.dataSource = dto.dataSource;
  }

  if (dto.displayName !== undefined) {
    food.displayName = dto.displayName;
  }

  if (dto.sourceFoodName !== undefined) {
    food.sourceFoodName = dto.sourceFoodName;
  }

  if (dto.sourceServingId !== undefined) {
    food.sourceServingId = dto.sourceServingId;
  }

  if (dto.servingDescription !== undefined) {
    food.servingDescription = dto.servingDescription;
  }

  if (dto.sourceRegion !== undefined) {
    food.sourceRegion = dto.sourceRegion;
  }

  if (dto.wasLocalized !== undefined) {
    food.wasLocalized = dto.wasLocalized;
  }

  if (dto.displayLocale !== undefined) {
    food.displayLocale = dto.displayLocale;
  }

  if (dto.localizer !== undefined) {
    food.localizer = dto.localizer;
  }

  return food;
}

function parseBackendFoodSearchItem(value: unknown): BackendFoodSearchItemDto | null {
  if (!isRecord(value) || !isRecord(value.nutritionPerServing)) {
    return null;
  }

  const servingSize = parseNullableNonNegativeNumber(value.servingSize);
  const nutritionPerServing = parseBackendFoodNutrition(value.nutritionPerServing);
  const dataSource = parseOptionalFoodDataSource(value.dataSource);
  const displayName = parseOptionalString(value.displayName);
  const sourceFoodId = parseOptionalString(value.sourceFoodId);
  const sourceFoodName = parseOptionalString(value.sourceFoodName);
  const sourceServingId = parseOptionalString(value.sourceServingId);
  const servingDescription = parseOptionalString(value.servingDescription);
  const sourceRegion = parseOptionalString(value.sourceRegion);
  const wasLocalized = parseOptionalBoolean(value.wasLocalized);
  const displayLocale = parseOptionalString(value.displayLocale);
  const localizer = parseOptionalString(value.localizer);

  if (
    !isNonEmptyString(value.id)
    || !isNonEmptyString(value.name)
    || !isNullableString(value.brandName)
    || servingSize === undefined
    || !isNullableString(value.servingUnit)
    || nutritionPerServing === null
    || displayName === null
    || sourceFoodId === null
    || sourceFoodName === null
    || sourceServingId === null
    || servingDescription === null
    || sourceRegion === null
    || wasLocalized === null
    || displayLocale === null
    || localizer === null
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    ...(displayName !== undefined ? { displayName } : {}),
    brandName: value.brandName,
    servingSize,
    servingUnit: value.servingUnit,
    nutritionPerServing,
    ...(dataSource !== undefined ? { dataSource } : {}),
    ...(sourceFoodId !== undefined ? { sourceFoodId } : {}),
    ...(sourceFoodName !== undefined ? { sourceFoodName } : {}),
    ...(sourceServingId !== undefined ? { sourceServingId } : {}),
    ...(servingDescription !== undefined ? { servingDescription } : {}),
    ...(sourceRegion !== undefined ? { sourceRegion } : {}),
    ...(wasLocalized !== undefined ? { wasLocalized } : {}),
    ...(displayLocale !== undefined ? { displayLocale } : {}),
    ...(localizer !== undefined ? { localizer } : {}),
  };
}

function parseBackendFoodNutrition(
  value: Record<string, unknown>,
): BackendFoodNutritionPerServingDto | null {
  const caloriesKcal = parseNullableNonNegativeNumber(value.caloriesKcal);
  const proteinG = parseNullableNonNegativeNumber(value.proteinG);
  const carbsG = parseNullableNonNegativeNumber(value.carbsG);
  const fatG = parseNullableNonNegativeNumber(value.fatG);

  if (
    caloriesKcal === undefined
    || proteinG === undefined
    || carbsG === undefined
    || fatG === undefined
  ) {
    return null;
  }

  return {
    caloriesKcal,
    proteinG,
    carbsG,
    fatG,
  };
}

function parseOptionalBackendFoodSearchQuery(
  value: unknown,
): FoodSearchQueryMetadata | undefined | null {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isRecord(value)) {
    return null;
  }

  const translator = parseOptionalString(value.translator);
  const status = parseOptionalQueryStatus(value.status);

  if (
    !isNonEmptyString(value.original)
    || !isNonEmptyString(value.resolved)
    || typeof value.wasTranslated !== 'boolean'
    || translator === null
    || status === null
  ) {
    return null;
  }

  return {
    original: value.original,
    resolved: value.resolved,
    wasTranslated: value.wasTranslated,
    ...(translator !== undefined ? { translator } : {}),
    ...(status !== undefined ? { status } : {}),
  };
}

function parseOptionalQueryStatus(value: unknown): FoodSearchQueryStatus | undefined | null {
  if (value === undefined || value === null) {
    return undefined;
  }

  return value === 'identity' || value === 'translated' || value === 'unresolved'
    ? value
    : null;
}

function parseNullableNonNegativeNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }

  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function parseOptionalBoolean(value: unknown): boolean | undefined | null {
  if (value === undefined || value === null) {
    return undefined;
  }

  return typeof value === 'boolean'
    ? value
    : null;
}

function parseOptionalString(value: unknown): string | undefined | null {
  if (value === undefined || value === null) {
    return undefined;
  }

  return typeof value === 'string'
    ? value
    : null;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
