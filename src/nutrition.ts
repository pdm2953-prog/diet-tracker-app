import {
  DailySummary,
  Meal,
  MealSummary,
  Nutrition,
  NutritionField,
} from './models';

export const nutritionFields: NutritionField[] = [
  'caloriesKcal',
  'carbohydrateG',
  'proteinG',
  'fatG',
  'sugarsG',
  'sodiumMg',
  'fiberG',
  'saturatedFatG',
  'transFatG',
  'cholesterolMg',
];

export const primaryNutritionFields = [
  'caloriesKcal',
  'proteinG',
  'carbohydrateG',
  'fatG',
] as const satisfies readonly NutritionField[];

export const nutritionLabels: Record<NutritionField, string> = {
  caloriesKcal: '칼로리',
  carbohydrateG: '탄수화물',
  proteinG: '단백질',
  fatG: '지방',
  sugarsG: '당류',
  sodiumMg: '나트륨',
  fiberG: '식이섬유',
  saturatedFatG: '포화지방',
  transFatG: '트랜스지방',
  cholesterolMg: '콜레스테롤',
};

export const nutritionUnits: Record<NutritionField, string> = {
  caloriesKcal: 'kcal',
  carbohydrateG: 'g',
  proteinG: 'g',
  fatG: 'g',
  sugarsG: 'g',
  sodiumMg: 'mg',
  fiberG: 'g',
  saturatedFatG: 'g',
  transFatG: 'g',
  cholesterolMg: 'mg',
};

export const dailyTargets: Pick<Nutrition, (typeof primaryNutritionFields)[number]> = {
  caloriesKcal: 2000,
  proteinG: 70,
  carbohydrateG: 300,
  fatG: 55,
};

export function createEmptyNutrition(): Nutrition {
  return {
    caloriesKcal: null,
    carbohydrateG: null,
    proteinG: null,
    fatG: null,
    sugarsG: null,
    sodiumMg: null,
    fiberG: null,
    saturatedFatG: null,
    transFatG: null,
    cholesterolMg: null,
  };
}

export function createZeroNutrition(): Nutrition {
  return {
    caloriesKcal: 0,
    carbohydrateG: 0,
    proteinG: 0,
    fatG: 0,
    sugarsG: 0,
    sodiumMg: 0,
    fiberG: 0,
    saturatedFatG: 0,
    transFatG: 0,
    cholesterolMg: 0,
  };
}

export type SummarizedNutrition = {
  total: Nutrition;
  missingFields: NutritionField[];
};

export function summarizeNutrition(
  nutritionItems: Nutrition[],
): SummarizedNutrition {
  if (nutritionItems.length === 0) {
    return {
      total: createZeroNutrition(),
      missingFields: [],
    };
  }

  const total = createEmptyNutrition();
  const missingFields: NutritionField[] = [];

  for (const field of nutritionFields) {
    let fieldTotal = 0;
    let hasNumber = false;
    let hasMissing = false;

    for (const nutrition of nutritionItems) {
      const value = nutrition[field];

      if (typeof value === 'number') {
        fieldTotal += value;
        hasNumber = true;
      } else {
        hasMissing = true;
      }
    }

    total[field] = hasNumber ? fieldTotal : null;

    if (hasMissing) {
      missingFields.push(field);
    }
  }

  return { total, missingFields };
}

export function calculateNutritionForConsumedGrams(
  nutrition: Nutrition,
  consumedGrams: number,
  servingSize: number,
): Nutrition {
  const adjusted = createEmptyNutrition();

  if (
    !Number.isFinite(consumedGrams) ||
    consumedGrams <= 0 ||
    !Number.isFinite(servingSize) ||
    servingSize <= 0
  ) {
    return adjusted;
  }

  const ratio = consumedGrams / servingSize;

  for (const field of nutritionFields) {
    const value = nutrition[field];
    adjusted[field] = typeof value === 'number'
      ? value * ratio
      : null;
  }

  return adjusted;
}

export function buildDailySummary(date: string, meals: Meal[]): DailySummary {
  const checkedMealFoods = meals.flatMap((meal) =>
    meal.foods.filter((mealFood) => mealFood.checked),
  );
  const plannedMealFoods = meals.flatMap((meal) => meal.foods);
  const checkedNutritionItems = checkedMealFoods.map((mealFood) =>
    mealFood.calculatedNutrition,
  );
  const plannedNutritionItems = plannedMealFoods.map((mealFood) =>
    mealFood.calculatedNutrition,
  );
  const checkedSummary = summarizeNutrition(checkedNutritionItems);
  const plannedSummary = summarizeNutrition(plannedNutritionItems);

  return {
    date,
    checkedNutritionTotal: checkedSummary.total,
    plannedNutritionTotal: plannedSummary.total,
    missingNutritionFields: checkedSummary.missingFields,
    checkedCount: checkedMealFoods.length,
    totalCount: plannedMealFoods.length,
    mealSummaries: meals.map(createMealSummary),
  };
}

export function createMealSummary(meal: Meal): MealSummary {
  const checkedMealFoods = meal.foods.filter((mealFood) => mealFood.checked);
  const plannedMealFoods = meal.foods;
  const checkedNutritionItems = checkedMealFoods.map((mealFood) =>
    mealFood.calculatedNutrition,
  );
  const plannedNutritionItems = plannedMealFoods.map((mealFood) =>
    mealFood.calculatedNutrition,
  );
  const checkedSummary = summarizeNutrition(checkedNutritionItems);
  const plannedSummary = summarizeNutrition(plannedNutritionItems);

  return {
    mealId: meal.id,
    type: meal.type,
    checkedNutritionTotal: checkedSummary.total,
    plannedNutritionTotal: plannedSummary.total,
    missingNutritionFields: checkedSummary.missingFields,
    checkedCount: checkedMealFoods.length,
    totalCount: plannedMealFoods.length,
  };
}

export function formatNutritionValue(
  field: NutritionField,
  value: number | null,
): string {
  if (value === null) {
    return '정보 없음';
  }

  const unit = nutritionUnits[field];

  if (unit === 'g') {
    return `${value.toFixed(1)} ${unit}`;
  }

  return `${Math.round(value)} ${unit}`;
}

export function formatNutritionNumber(
  field: NutritionField,
  value: number | null,
): string {
  if (value === null) {
    return '정보 없음';
  }

  return nutritionUnits[field] === 'g'
    ? value.toFixed(1)
    : String(Math.round(value));
}
