import type {
  FixedMealTemplate,
  FixedMealTemplateItem,
  FixedMealWeekday,
  Food,
  HiddenFixedMealSourceKeysByDate,
  Meal,
  MealFood,
  MealType,
} from './models';
import {
  allFixedMealWeekdays,
  fixedMealTemplateAppliesOnDate,
  normalizeFixedMealWeekdays,
  toggleFixedMealWeekdaySelection,
} from './fixedMealRecurrence';
import { calculateNutritionForConsumedGrams } from './nutrition';
import {
  createEmptyMealsForDate,
  hasValidGramServing,
  mealTypes,
  normalizeConsumedGrams,
} from './meals';
import { isValidLocalDateString } from './utils/date';
import { getFoodDisplayName } from './utils/foodDisplay';

export type ApplyFixedMealTemplatesOptions = {
  date: string;
  fixedMealTemplates: FixedMealTemplate[];
  hiddenSourceKeys: string[];
  meals: Meal[];
  timestamp: string;
};

export type CreateFixedMealTemplateOptions = {
  food: Food;
  mealFood: MealFood;
  mealType: MealType;
  templateId: string;
  templateItemId: string;
  timestamp: string;
  weekdays?: readonly FixedMealWeekday[];
};

export type FixedMealSourceFields = {
  generatedFromFixedMealTemplateId: string;
  generatedFromFixedMealTemplateItemId: string;
  generatedFromFixedMealSourceKey: string;
  fixedMealTemplateItemId: string;
  sourceKey: string;
};

export type FixedMealTemplateItemReference = {
  item: FixedMealTemplateItem;
  sourceFields: FixedMealSourceFields;
  template: FixedMealTemplate;
};

export type PromoteMealFoodToFixedMealOptions = CreateFixedMealTemplateOptions & {
  fixedMealTemplates: FixedMealTemplate[];
};

export type PromoteMealFoodToFixedMealResult = {
  createdTemplate: boolean;
  fixedMealTemplates: FixedMealTemplate[];
  sourceFields: FixedMealSourceFields | null;
};

export type PromoteMealFoodInMealsOptions = {
  mealFoodId: string;
  meals: Meal[];
  sourceFields: FixedMealSourceFields;
  timestamp: string;
};

export function createFixedMealSourceKey(
  templateId: string,
  templateItemId: string,
): string {
  return `${templateId}:${templateItemId}`;
}

export function createFixedMealSourceFields(
  templateId: string,
  templateItemId: string,
): FixedMealSourceFields {
  const sourceKey = createFixedMealSourceKey(templateId, templateItemId);

  return {
    generatedFromFixedMealTemplateId: templateId,
    generatedFromFixedMealTemplateItemId: templateItemId,
    generatedFromFixedMealSourceKey: sourceKey,
    fixedMealTemplateItemId: templateItemId,
    sourceKey,
  };
}

export function createPromotedFixedMealTemplateIds(
  mealType: MealType,
  mealFood: MealFood,
  weekdays: readonly FixedMealWeekday[] = allFixedMealWeekdays,
): { templateId: string; templateItemId: string } {
  const foodIdPart = createStableIdPart(mealFood.foodId);
  const weekdaysPart = createStableIdPart(normalizeFixedMealWeekdays(weekdays).join('-'));
  const gramsPart = createStableIdPart(formatStableNumber(
    normalizeConsumedGrams(mealFood.consumedGrams),
  ));

  return {
    templateId: `fixed-template-daily-${mealType}-${foodIdPart}-${gramsPart}-${weekdaysPart}`,
    templateItemId: `item-${foodIdPart}-${gramsPart}`,
  };
}

export function isFixedMealFood(mealFood: MealFood): boolean {
  return typeof mealFood.generatedFromFixedMealTemplateId === 'string'
    && mealFood.generatedFromFixedMealTemplateId.length > 0;
}

export function getMealFoodFixedSourceKey(mealFood: MealFood): string | undefined {
  return mealFood.sourceKey ?? mealFood.generatedFromFixedMealSourceKey;
}

export function getMealFoodFixedTemplateItemId(mealFood: MealFood): string | undefined {
  return mealFood.fixedMealTemplateItemId
    ?? mealFood.generatedFromFixedMealTemplateItemId;
}

export function applyFixedMealTemplatesToMeals({
  date,
  fixedMealTemplates,
  hiddenSourceKeys,
  meals,
  timestamp,
}: ApplyFixedMealTemplatesOptions): Meal[] {
  const normalizedMeals = normalizeMealsForDate(meals, date, timestamp);
  const hiddenSourceKeySet = new Set(hiddenSourceKeys);
  const mealIdByType = Object.fromEntries(
    normalizedMeals.map((meal) => [meal.type, meal.id]),
  ) as Record<MealType, string>;
  const existingSourceKeys = new Set(
    normalizedMeals.flatMap((meal) =>
      meal.foods.flatMap((mealFood) => {
        const sourceKey = getMealFoodFixedSourceKey(mealFood);

        return sourceKey ? [sourceKey] : [];
      }),
    ),
  );

  const generatedFoodsByMealType = fixedMealTemplates.reduce<Record<MealType, MealFood[]>>(
    (foodsByMealType, template) => {
      if (!fixedMealTemplateAppliesOnDate(template, date)) {
        return foodsByMealType;
      }

      const targetMealId = mealIdByType[template.mealType];

      for (const item of template.items) {
        const sourceKey = createFixedMealSourceKey(template.id, item.id);

        if (hiddenSourceKeySet.has(sourceKey) || existingSourceKeys.has(sourceKey)) {
          continue;
        }

        existingSourceKeys.add(sourceKey);
        foodsByMealType[template.mealType] = [
          ...foodsByMealType[template.mealType],
          createMealFoodFromFixedTemplateItem(
            date,
            targetMealId,
            template,
            item,
            sourceKey,
            timestamp,
          ),
        ];
      }

      return foodsByMealType;
    },
    {
      breakfast: [],
      lunch: [],
      dinner: [],
    },
  );

  return normalizedMeals.map((meal) => ({
    ...meal,
    foods: [...meal.foods, ...generatedFoodsByMealType[meal.type]],
  }));
}

export function getHiddenFixedMealSourceKeysForDate(
  hiddenFixedMealSourceKeys: HiddenFixedMealSourceKeysByDate,
  date: string,
): string[] {
  return hiddenFixedMealSourceKeys[date] ?? [];
}

export function hideFixedMealSourceKeyForDate(
  hiddenFixedMealSourceKeys: HiddenFixedMealSourceKeysByDate,
  date: string,
  sourceKey: string,
): HiddenFixedMealSourceKeysByDate {
  if (!isValidLocalDateString(date) || sourceKey.length === 0) {
    return hiddenFixedMealSourceKeys;
  }

  const currentSourceKeys = hiddenFixedMealSourceKeys[date] ?? [];

  if (currentSourceKeys.includes(sourceKey)) {
    return hiddenFixedMealSourceKeys;
  }

  return {
    ...hiddenFixedMealSourceKeys,
    [date]: [...currentSourceKeys, sourceKey],
  };
}

export function createDailyFixedMealTemplateFromMealFood({
  food,
  mealFood,
  mealType,
  templateId,
  templateItemId,
  timestamp,
  weekdays = allFixedMealWeekdays,
}: CreateFixedMealTemplateOptions): FixedMealTemplate | null {
  if (
    !hasValidGramServing(food)
    || !Number.isFinite(mealFood.consumedGrams)
    || mealFood.consumedGrams <= 0
  ) {
    return null;
  }

  const item: FixedMealTemplateItem = {
    id: templateItemId,
    foodId: food.id,
    foodSnapshot: food,
    consumedGrams: mealFood.consumedGrams,
    calculatedNutrition: calculateNutritionForConsumedGrams(
      food.nutritionPerServing,
      mealFood.consumedGrams,
      food.servingSize,
    ),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return {
    id: templateId,
    name: `${getFoodDisplayName(food)} 고정 식단`,
    mealType,
    schedule: 'daily',
    weekdays: normalizeFixedMealWeekdays(weekdays),
    isActive: true,
    items: [item],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function promoteMealFoodToFixedMeal({
  fixedMealTemplates,
  food,
  mealFood,
  mealType,
  templateId,
  templateItemId,
  timestamp,
  weekdays = allFixedMealWeekdays,
}: PromoteMealFoodToFixedMealOptions): PromoteMealFoodToFixedMealResult {
  if (isFixedMealFood(mealFood)) {
    return {
      createdTemplate: false,
      fixedMealTemplates,
      sourceFields: createFixedMealSourceFieldsFromMealFood(mealFood),
    };
  }

  const existingTemplateItem = findEquivalentDailyFixedMealTemplateItem(
    fixedMealTemplates,
    mealType,
    mealFood,
    weekdays,
  );

  if (existingTemplateItem !== null) {
    return {
      createdTemplate: false,
      fixedMealTemplates: existingTemplateItem.template.isActive
        ? fixedMealTemplates
        : setFixedMealTemplateActive(
            fixedMealTemplates,
            existingTemplateItem.template.id,
            true,
            timestamp,
          ),
      sourceFields: existingTemplateItem.sourceFields,
    };
  }

  const template = createDailyFixedMealTemplateFromMealFood({
    food,
    mealFood,
    mealType,
    templateId,
    templateItemId,
    timestamp,
    weekdays,
  });

  if (template === null) {
    return {
      createdTemplate: false,
      fixedMealTemplates,
      sourceFields: null,
    };
  }

  return {
    createdTemplate: true,
    fixedMealTemplates: [...fixedMealTemplates, template],
    sourceFields: createFixedMealSourceFields(template.id, template.items[0].id),
  };
}

export function promoteMealFoodInMeals({
  mealFoodId,
  meals,
  sourceFields,
  timestamp,
}: PromoteMealFoodInMealsOptions): Meal[] {
  const hasTargetMealFood = meals.some((meal) =>
    meal.foods.some((mealFood) => mealFood.id === mealFoodId),
  );

  if (!hasTargetMealFood) {
    return meals;
  }

  let changed = false;

  const promotedMeals = meals.map((meal) => {
    let mealChanged = false;
    const promotedFoods: MealFood[] = [];

    for (const mealFood of meal.foods) {
      if (mealFood.id === mealFoodId) {
        const promotedMealFood = hasSameFixedMealSourceFields(mealFood, sourceFields)
          ? mealFood
          : {
              ...mealFood,
              ...sourceFields,
              updatedAt: timestamp,
            };

        promotedFoods.push(promotedMealFood);
        mealChanged = mealChanged || promotedMealFood !== mealFood;
        continue;
      }

      if (getMealFoodFixedSourceKey(mealFood) === sourceFields.sourceKey) {
        mealChanged = true;
        changed = true;
        continue;
      }

      promotedFoods.push(mealFood);
    }

    if (!mealChanged) {
      return meal;
    }

    changed = true;
    return {
      ...meal,
      updatedAt: timestamp,
      foods: promotedFoods,
    };
  });

  return changed ? promotedMeals : meals;
}

export function findEquivalentDailyFixedMealTemplateItem(
  fixedMealTemplates: FixedMealTemplate[],
  mealType: MealType,
  mealFood: MealFood,
  weekdays: readonly FixedMealWeekday[] = allFixedMealWeekdays,
): FixedMealTemplateItemReference | null {
  const consumedGrams = normalizeConsumedGrams(mealFood.consumedGrams);
  const normalizedWeekdays = normalizeFixedMealWeekdays(weekdays);

  if (consumedGrams <= 0) {
    return null;
  }

  for (const template of fixedMealTemplates) {
    if (
      template.schedule !== 'daily'
      || template.mealType !== mealType
      || !areFixedMealWeekdaysEqual(template.weekdays, normalizedWeekdays)
    ) {
      continue;
    }

    const item = template.items.find((templateItem) =>
      templateItem.foodId === mealFood.foodId
      && templateItem.consumedGrams === consumedGrams,
    );

    if (item !== undefined) {
      return {
        item,
        sourceFields: createFixedMealSourceFields(template.id, item.id),
        template,
      };
    }
  }

  return null;
}

export function hasEquivalentDailyFixedMealTemplate(
  fixedMealTemplates: FixedMealTemplate[],
  mealType: MealType,
  mealFood: MealFood,
  weekdays: readonly FixedMealWeekday[] = allFixedMealWeekdays,
): boolean {
  return findEquivalentDailyFixedMealTemplateItem(
    fixedMealTemplates,
    mealType,
    mealFood,
    weekdays,
  ) !== null;
}

export function setFixedMealTemplateActive(
  fixedMealTemplates: FixedMealTemplate[],
  templateId: string,
  isActive: boolean,
  updatedAt: string,
): FixedMealTemplate[] {
  return fixedMealTemplates.map((template) =>
    template.id === templateId && template.isActive !== isActive
      ? { ...template, isActive, updatedAt }
      : template,
  );
}

export function removeFixedMealTemplateById(
  fixedMealTemplates: FixedMealTemplate[],
  templateId: string,
): FixedMealTemplate[] {
  return fixedMealTemplates.filter((template) => template.id !== templateId);
}

export function setFixedMealTemplateWeekdays(
  fixedMealTemplates: FixedMealTemplate[],
  templateId: string,
  weekdays: readonly FixedMealWeekday[],
  updatedAt: string,
): FixedMealTemplate[] {
  if (weekdays.length === 0) {
    return fixedMealTemplates;
  }

  const normalizedWeekdays = normalizeFixedMealWeekdays(weekdays);

  return fixedMealTemplates.map((template) => {
    if (template.id !== templateId) {
      return template;
    }

    if (areFixedMealWeekdaysEqual(template.weekdays, normalizedWeekdays)) {
      return template;
    }

    return {
      ...template,
      weekdays: normalizedWeekdays,
      updatedAt,
    };
  });
}

export function toggleFixedMealTemplateWeekday(
  fixedMealTemplates: FixedMealTemplate[],
  templateId: string,
  weekday: FixedMealWeekday,
  updatedAt: string,
): FixedMealTemplate[] {
  return fixedMealTemplates.map((template) => {
    if (template.id !== templateId) {
      return template;
    }

    const nextWeekdays = toggleFixedMealWeekdaySelection(template.weekdays, weekday);

    if (areFixedMealWeekdaysEqual(template.weekdays, nextWeekdays)) {
      return template;
    }

    return {
      ...template,
      weekdays: nextWeekdays,
      updatedAt,
    };
  });
}

function areFixedMealWeekdaysEqual(
  firstWeekdays: readonly FixedMealWeekday[],
  secondWeekdays: readonly FixedMealWeekday[],
): boolean {
  const firstNormalized = normalizeFixedMealWeekdays(firstWeekdays);
  const secondNormalized = normalizeFixedMealWeekdays(secondWeekdays);

  return firstNormalized.length === secondNormalized.length
    && firstNormalized.every((weekday, index) => weekday === secondNormalized[index]);
}
export function getFixedMealTemplateFoodSnapshots(
  fixedMealTemplates: FixedMealTemplate[],
): Food[] {
  const foodsById = new Map<string, Food>();

  for (const template of fixedMealTemplates) {
    for (const item of template.items) {
      foodsById.set(item.foodSnapshot.id, item.foodSnapshot);
    }
  }

  return [...foodsById.values()];
}

function normalizeMealsForDate(
  meals: Meal[],
  date: string,
  timestamp: string,
): Meal[] {
  const existingMealsByType = new Map(meals.map((meal) => [meal.type, meal]));
  const fallbackMeals = createEmptyMealsForDate(date, timestamp);

  return mealTypes.map((mealType) => {
    const existingMeal = existingMealsByType.get(mealType);

    if (existingMeal) {
      return existingMeal;
    }

    return fallbackMeals.find((meal) => meal.type === mealType) ?? {
      id: `meal-${date}-${mealType}`,
      date,
      type: mealType,
      foods: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
}

function createMealFoodFromFixedTemplateItem(
  date: string,
  mealId: string,
  template: FixedMealTemplate,
  item: FixedMealTemplateItem,
  sourceKey: string,
  timestamp: string,
): MealFood {
  const sourceFields = createFixedMealSourceFields(template.id, item.id);

  return {
    id: `fixed-${date}-${sourceKey}`,
    foodId: item.foodId,
    mealId,
    consumedGrams: item.consumedGrams,
    checked: false,
    calculatedNutrition: item.calculatedNutrition,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...sourceFields,
  };
}

function createFixedMealSourceFieldsFromMealFood(
  mealFood: MealFood,
): FixedMealSourceFields | null {
  const templateId = mealFood.generatedFromFixedMealTemplateId;
  const templateItemId = getMealFoodFixedTemplateItemId(mealFood);
  const sourceKey = getMealFoodFixedSourceKey(mealFood);

  if (
    templateId === undefined
    || templateItemId === undefined
    || sourceKey === undefined
  ) {
    return null;
  }

  return {
    generatedFromFixedMealTemplateId: templateId,
    generatedFromFixedMealTemplateItemId: templateItemId,
    generatedFromFixedMealSourceKey: sourceKey,
    fixedMealTemplateItemId: templateItemId,
    sourceKey,
  };
}

function hasSameFixedMealSourceFields(
  mealFood: MealFood,
  sourceFields: FixedMealSourceFields,
): boolean {
  return mealFood.generatedFromFixedMealTemplateId === sourceFields.generatedFromFixedMealTemplateId
    && getMealFoodFixedTemplateItemId(mealFood) === sourceFields.fixedMealTemplateItemId
    && getMealFoodFixedSourceKey(mealFood) === sourceFields.sourceKey;
}

function formatStableNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function createStableIdPart(value: string): string {
  const normalizedValue = value.replace(/[^A-Za-z0-9_-]/g, '_').replace(/_+/g, '_');
  const trimmedValue = normalizedValue.replace(/^_+|_+$/g, '').slice(0, 48);
  const readablePart = trimmedValue.length > 0 ? trimmedValue : 'value';

  return `${readablePart}-${hashString(value)}`;
}

function hashString(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }

  return (hash >>> 0).toString(36);
}
