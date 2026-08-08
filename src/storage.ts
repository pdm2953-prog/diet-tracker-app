import type {
  FixedMealTemplate,
  Food,
  HiddenFixedMealSourceKeysByDate,
  Meal,
  MealFood,
  MealsByDate,
  Nutrition,
} from './models';
import { mealTypes } from './meals';
import { dailyTargets } from './nutrition';
import type { DailyNutritionTargets } from './nutrition';
import { isValidLocalDateString } from './utils/date';

export type AppDataSnapshot = {
  fixedMealTemplates: FixedMealTemplate[];
  foods: Food[];
  hiddenFixedMealSourceKeys: HiddenFixedMealSourceKeysByDate;
  mealsByDate: MealsByDate;
  todayTargets: DailyNutritionTargets;
};

export type VersionedLocalAppData = AppDataSnapshot & {
  version: 1;
};

type StorageAdapter = {
  getItem: (key: string) => Promise<string | null> | string | null;
  setItem: (key: string, value: string) => Promise<void> | void;
};


export const APP_DATA_STORAGE_KEY = 'diet-tracker-app:app-data';
export const APP_DATA_STORAGE_VERSION = 1;

export function createDefaultAppDataSnapshot(
  foods: Food[],
  mealsByDate: MealsByDate,
): AppDataSnapshot {
  return {
    fixedMealTemplates: [],
    foods,
    hiddenFixedMealSourceKeys: {},
    mealsByDate,
    todayTargets: dailyTargets,
  };
}

export function serializeAppDataSnapshot(data: AppDataSnapshot): string {
  const versionedData: VersionedLocalAppData = {
    version: APP_DATA_STORAGE_VERSION,
    fixedMealTemplates: data.fixedMealTemplates,
    foods: data.foods,
    hiddenFixedMealSourceKeys: data.hiddenFixedMealSourceKeys,
    mealsByDate: data.mealsByDate,
    todayTargets: data.todayTargets,
  };

  return JSON.stringify(versionedData);
}

export function restoreAppDataSnapshot(
  rawValue: string | null,
  fallback: AppDataSnapshot,
): AppDataSnapshot {
  if (rawValue === null) {
    return fallback;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as unknown;

    if (!isRecord(parsedValue) || parsedValue.version !== APP_DATA_STORAGE_VERSION) {
      return fallback;
    }

    return {
      fixedMealTemplates: parseFixedMealTemplates(
        parsedValue.fixedMealTemplates,
        fallback.fixedMealTemplates,
      ),
      foods: parseFoods(parsedValue.foods, fallback.foods),
      hiddenFixedMealSourceKeys: parseHiddenFixedMealSourceKeys(
        parsedValue.hiddenFixedMealSourceKeys,
        fallback.hiddenFixedMealSourceKeys,
      ),
      mealsByDate: parseMealsByDate(parsedValue.mealsByDate, fallback.mealsByDate),
      todayTargets: parseDailyNutritionTargets(
        parsedValue.todayTargets,
        fallback.todayTargets,
      ),
    };
  } catch {
    return fallback;
  }
}

export async function loadAppDataSnapshot(
  fallback: AppDataSnapshot,
): Promise<AppDataSnapshot> {
  const storage = await getStorageAdapter();

  if (storage === null) {
    return fallback;
  }

  try {
    return restoreAppDataSnapshot(await storage.getItem(APP_DATA_STORAGE_KEY), fallback);
  } catch {
    return fallback;
  }
}

export async function saveAppDataSnapshot(data: AppDataSnapshot): Promise<void> {
  const storage = await getStorageAdapter();

  if (storage === null) {
    return;
  }

  try {
    await storage.setItem(APP_DATA_STORAGE_KEY, serializeAppDataSnapshot(data));
  } catch {
    // Storage can fail when the platform adapter is unavailable or quota is exceeded.
  }
}

async function getStorageAdapter(): Promise<StorageAdapter | null> {
  try {
    const asyncStorageModule = await import('@react-native-async-storage/async-storage');

    return asyncStorageModule.default;
  } catch {
    return getLocalStorageAdapter();
  }
}

function getLocalStorageAdapter(): StorageAdapter | null {
  const globalValue = globalThis as typeof globalThis & {
    localStorage?: StorageAdapter;
  };

  return globalValue.localStorage ?? null;
}

function parseDailyNutritionTargets(
  value: unknown,
  fallback: DailyNutritionTargets,
): DailyNutritionTargets {
  if (!isRecord(value)) {
    return fallback;
  }

  const parsedTargets = {
    caloriesKcal: parseFiniteNumber(value.caloriesKcal),
    proteinG: parseFiniteNumber(value.proteinG),
    carbohydrateG: parseFiniteNumber(value.carbohydrateG),
    fatG: parseFiniteNumber(value.fatG),
  };

  if (Object.values(parsedTargets).some((target) => target === null)) {
    return fallback;
  }

  return parsedTargets as DailyNutritionTargets;
}

function parseFoods(value: unknown, fallback: Food[]): Food[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const parsedFoods = value.map(parseFood);

  if (parsedFoods.some((food) => food === null)) {
    return fallback;
  }

  return parsedFoods as Food[];
}

function parseMealsByDate(value: unknown, fallback: MealsByDate): MealsByDate {
  if (!isRecord(value)) {
    return fallback;
  }

  const parsedEntries: Array<[string, Meal[]]> = [];

  for (const [date, mealsValue] of Object.entries(value)) {
    if (!isValidLocalDateString(date) || !Array.isArray(mealsValue)) {
      return fallback;
    }

    const parsedMeals = mealsValue.map((mealValue) => parseMeal(mealValue, date));

    if (parsedMeals.some((meal) => meal === null)) {
      return fallback;
    }

    parsedEntries.push([date, parsedMeals as Meal[]]);
  }

  return Object.fromEntries(parsedEntries);
}

function parseHiddenFixedMealSourceKeys(
  value: unknown,
  fallback: HiddenFixedMealSourceKeysByDate,
): HiddenFixedMealSourceKeysByDate {
  if (!isRecord(value)) {
    return fallback;
  }

  const parsedEntries: Array<[string, string[]]> = [];

  for (const [date, sourceKeysValue] of Object.entries(value)) {
    if (!isValidLocalDateString(date) || !Array.isArray(sourceKeysValue)) {
      return fallback;
    }

    if (!sourceKeysValue.every((sourceKey) => typeof sourceKey === 'string')) {
      return fallback;
    }

    parsedEntries.push([date, sourceKeysValue]);
  }

  return Object.fromEntries(parsedEntries);
}

function parseFixedMealTemplates(
  value: unknown,
  fallback: FixedMealTemplate[],
): FixedMealTemplate[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const parsedTemplates = value.map(parseFixedMealTemplate);

  if (parsedTemplates.some((template) => template === null)) {
    return fallback;
  }

  return parsedTemplates as FixedMealTemplate[];
}

function parseFixedMealTemplate(value: unknown): FixedMealTemplate | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isNonEmptyString(value.id)
    || !isNonEmptyString(value.name)
    || !isMealType(value.mealType)
    || value.schedule !== 'daily'
    || typeof value.isActive !== 'boolean'
    || !isNonEmptyString(value.createdAt)
    || !isNonEmptyString(value.updatedAt)
    || !Array.isArray(value.items)
  ) {
    return null;
  }

  const parsedItems = value.items.map(parseFixedMealTemplateItem);

  if (parsedItems.some((item) => item === null)) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    mealType: value.mealType,
    schedule: 'daily',
    isActive: value.isActive,
    items: parsedItems as FixedMealTemplate['items'],
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function parseFixedMealTemplateItem(value: unknown): FixedMealTemplate['items'][number] | null {
  if (!isRecord(value)) {
    return null;
  }

  const consumedGrams = parseFiniteNumber(value.consumedGrams);
  const foodSnapshot = parseFood(value.foodSnapshot);
  const calculatedNutrition = parseNutrition(value.calculatedNutrition);

  if (
    !isNonEmptyString(value.id)
    || !isNonEmptyString(value.foodId)
    || consumedGrams === null
    || consumedGrams <= 0
    || foodSnapshot === null
    || calculatedNutrition === null
    || !isNonEmptyString(value.createdAt)
    || !isNonEmptyString(value.updatedAt)
  ) {
    return null;
  }

  return {
    id: value.id,
    foodId: value.foodId,
    foodSnapshot,
    consumedGrams,
    calculatedNutrition,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function parseMeal(value: unknown, date: string): Meal | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isNonEmptyString(value.id)
    || value.date !== date
    || !isMealType(value.type)
    || !Array.isArray(value.foods)
    || !isNonEmptyString(value.createdAt)
    || !isNonEmptyString(value.updatedAt)
  ) {
    return null;
  }

  const mealId = value.id;
  const mealType = value.type;
  const createdAt = value.createdAt;
  const updatedAt = value.updatedAt;
  const parsedMealFoods = value.foods.map((mealFoodValue) =>
    parseMealFood(mealFoodValue, mealId),
  );

  if (parsedMealFoods.some((mealFood) => mealFood === null)) {
    return null;
  }

  return {
    id: mealId,
    date,
    type: mealType,
    foods: parsedMealFoods as MealFood[],
    createdAt,
    updatedAt,
  };
}

function parseMealFood(value: unknown, mealId: string): MealFood | null {
  if (!isRecord(value)) {
    return null;
  }

  const consumedGrams = parseFiniteNumber(value.consumedGrams);
  const calculatedNutrition = parseNutrition(value.calculatedNutrition);

  if (
    !isNonEmptyString(value.id)
    || !isNonEmptyString(value.foodId)
    || value.mealId !== mealId
    || consumedGrams === null
    || consumedGrams < 0
    || typeof value.checked !== 'boolean'
    || calculatedNutrition === null
    || !isNonEmptyString(value.createdAt)
    || !isNonEmptyString(value.updatedAt)
  ) {
    return null;
  }

  const generatedFromFixedMealTemplateId = parseOptionalString(
    value.generatedFromFixedMealTemplateId,
  );
  const fixedMealTemplateItemId = parseOptionalString(value.fixedMealTemplateItemId)
    ?? parseOptionalString(value.generatedFromFixedMealTemplateItemId);
  const sourceKey = parseOptionalString(value.sourceKey)
    ?? parseOptionalString(value.generatedFromFixedMealSourceKey);

  return {
    id: value.id,
    foodId: value.foodId,
    mealId,
    consumedGrams,
    checked: value.checked,
    calculatedNutrition,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    generatedFromFixedMealTemplateId,
    generatedFromFixedMealTemplateItemId: fixedMealTemplateItemId,
    generatedFromFixedMealSourceKey: sourceKey,
    fixedMealTemplateItemId,
    sourceKey,
  };
}

function parseFood(value: unknown): Food | null {
  if (!isRecord(value)) {
    return null;
  }

  const servingSize = value.servingSize === null
    ? null
    : parseFiniteNumber(value.servingSize);
  const nutritionPerServing = parseNutrition(value.nutritionPerServing);
  const dataSource = parseOptionalFoodDataSource(value.dataSource);
  const sourceFoodName = parseOptionalString(value.sourceFoodName);
  const sourceServingId = parseOptionalString(value.sourceServingId);
  const servingDescription = parseOptionalString(value.servingDescription);
  const sourceRegion = parseOptionalString(value.sourceRegion);

  if (
    !isNonEmptyString(value.id)
    || !isNonEmptyString(value.source)
    || !isNonEmptyString(value.sourceFoodId)
    || !isNonEmptyString(value.name)
    || !isNullableString(value.brandName)
    || !isNullableString(value.category)
    || servingSize === undefined
    || !isNullableString(value.servingUnit)
    || nutritionPerServing === null
    || !isNonEmptyString(value.updatedAt)
    || dataSource === null
  ) {
    return null;
  }

  return {
    id: value.id,
    source: value.source,
    sourceFoodId: value.sourceFoodId,
    name: value.name,
    brandName: value.brandName,
    category: value.category,
    servingSize,
    servingUnit: value.servingUnit,
    nutritionPerServing,
    updatedAt: value.updatedAt,
    ...(dataSource !== undefined ? { dataSource } : {}),
    ...(sourceFoodName !== undefined ? { sourceFoodName } : {}),
    ...(sourceServingId !== undefined ? { sourceServingId } : {}),
    ...(servingDescription !== undefined ? { servingDescription } : {}),
    ...(sourceRegion !== undefined ? { sourceRegion } : {}),
  };
}

function parseNutrition(value: unknown): Nutrition | null {
  if (!isRecord(value)) {
    return null;
  }

  const nutrition = {
    caloriesKcal: parseNutritionNumber(value.caloriesKcal),
    carbohydrateG: parseNutritionNumber(value.carbohydrateG),
    proteinG: parseNutritionNumber(value.proteinG),
    fatG: parseNutritionNumber(value.fatG),
    sugarsG: parseNutritionNumber(value.sugarsG),
    sodiumMg: parseNutritionNumber(value.sodiumMg),
    fiberG: parseNutritionNumber(value.fiberG),
    saturatedFatG: parseNutritionNumber(value.saturatedFatG),
    transFatG: parseNutritionNumber(value.transFatG),
    cholesterolMg: parseNutritionNumber(value.cholesterolMg),
  };

  return Object.values(nutrition).some((numberOrNull) => numberOrNull === undefined)
    ? null
    : nutrition as Nutrition;
}

function parseNutritionNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }

  const parsedNumber = parseFiniteNumber(value);

  return parsedNumber !== null && parsedNumber >= 0 ? parsedNumber : undefined;
}

function parseFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function parseOptionalFoodDataSource(value: unknown): Food['dataSource'] | null | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return value === 'mock' || value === 'fatsecret'
    ? value
    : null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isMealType(value: unknown): value is Meal['type'] {
  return typeof value === 'string' && mealTypes.includes(value as Meal['type']);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
