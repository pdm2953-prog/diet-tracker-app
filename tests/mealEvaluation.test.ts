import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addFoodToMeals,
  createEmptyMealsForDate,
  updateMealsForDate,
} from '../src/meals';
import { evaluateDailyMeal } from '../src/mealEvaluation';
import type { DailySummary, Food, MealsByDate, Nutrition } from '../src/models';
import {
  buildDailySummary,
  createZeroNutrition,
} from '../src/nutrition';
import type { DailyNutritionTargets } from '../src/nutrition';
import { shiftLocalDateString } from '../src/utils/format';

const targets: DailyNutritionTargets = {
  caloriesKcal: 2000,
  proteinG: 100,
  carbohydrateG: 250,
  fatG: 60,
};

const timestamp = '2026-07-17T00:00:00.000Z';

function makeNutrition(overrides: Partial<Nutrition> = {}): Nutrition {
  return {
    ...createZeroNutrition(),
    ...overrides,
  };
}

function makeCheckedMealFood(id: string, mealId: string, calculatedNutrition: Nutrition) {
  return {
    id,
    foodId: `food-${id}`,
    mealId,
    consumedGrams: 100,
    checked: true,
    calculatedNutrition,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function makeDailySummary(
  overrides: Partial<Nutrition> & {
    checkedCount?: number;
    missingNutritionFields?: DailySummary['missingNutritionFields'];
  },
): DailySummary {
  const checkedCount = overrides.checkedCount ?? 1;
  const checkedNutritionTotal = makeNutrition({
    caloriesKcal: overrides.caloriesKcal ?? 2000,
    proteinG: overrides.proteinG ?? 100,
    carbohydrateG: overrides.carbohydrateG ?? 250,
    fatG: overrides.fatG ?? 60,
  });

  return {
    date: '2026-07-17',
    checkedNutritionTotal,
    plannedNutritionTotal: checkedNutritionTotal,
    missingNutritionFields: overrides.missingNutritionFields ?? [],
    checkedCount,
    totalCount: checkedCount,
    mealSummaries: [],
  };
}

test('evaluateDailyMeal returns excellent when calories are 95-105 percent and protein is 100 percent or more', () => {
  const result = evaluateDailyMeal(makeDailySummary({
    caloriesKcal: 2000,
    proteinG: 100,
  }), targets);

  assert.equal(result.status, 'excellent');
  assert.equal(result.score, 100);
});

test('evaluateDailyMeal returns good when calories are 90-110 percent and protein is at least 90 percent', () => {
  const result = evaluateDailyMeal(makeDailySummary({
    caloriesKcal: 1800,
    proteinG: 90,
  }), targets);

  assert.equal(result.status, 'good');
  assert.equal(result.score, 80);
});

test('evaluateDailyMeal returns low when calories are below 90 percent', () => {
  const result = evaluateDailyMeal(makeDailySummary({
    caloriesKcal: 1700,
    proteinG: 100,
  }), targets);

  assert.equal(result.status, 'low');
});

test('evaluateDailyMeal returns high when calories are above 110 percent', () => {
  const result = evaluateDailyMeal(makeDailySummary({
    caloriesKcal: 2300,
    proteinG: 100,
  }), targets);

  assert.equal(result.status, 'high');
});

test('evaluateDailyMeal returns incomplete when no checked foods are recorded', () => {
  const result = evaluateDailyMeal(makeDailySummary({ checkedCount: 0 }), targets);

  assert.equal(result.status, 'incomplete');
  assert.equal(result.score, 0);
});

test('evaluateDailyMeal returns incomplete when checked foods are missing calories', () => {
  const result = evaluateDailyMeal(makeDailySummary({
    missingNutritionFields: ['caloriesKcal'],
  }), targets);

  assert.equal(result.status, 'incomplete');
  assert.equal(result.score, 0);
  assert.equal(result.messages.some((message) => message.includes('핵심 영양정보')), true);
});

test('evaluateDailyMeal returns incomplete when checked foods are missing protein', () => {
  const result = evaluateDailyMeal(makeDailySummary({
    missingNutritionFields: ['proteinG'],
  }), targets);

  assert.equal(result.status, 'incomplete');
  assert.equal(result.score, 0);
  assert.equal(result.messages.some((message) => message.includes('핵심 영양정보')), true);
});

test('evaluateDailyMeal does not return good or excellent for mixed checked foods with missing core nutrition', () => {
  const [breakfastMeal, ...otherMeals] = createEmptyMealsForDate('2026-07-17', timestamp);
  const summary = buildDailySummary('2026-07-17', [
    {
      ...breakfastMeal,
      foods: [
        makeCheckedMealFood(breakfastMeal.id, breakfastMeal.id, makeNutrition({
          caloriesKcal: 2000,
          proteinG: 100,
          carbohydrateG: 250,
          fatG: 60,
        })),
        makeCheckedMealFood('missing-calories', breakfastMeal.id, makeNutrition({
          caloriesKcal: null,
          proteinG: 0,
          carbohydrateG: 0,
          fatG: 0,
        })),
      ],
    },
    ...otherMeals,
  ]);
  const result = evaluateDailyMeal(summary, targets);

  assert.equal(summary.checkedCount, 2);
  assert.equal(summary.checkedNutritionTotal.caloriesKcal, 2000);
  assert.equal(summary.checkedNutritionTotal.proteinG, 100);
  assert.equal(summary.missingNutritionFields.includes('caloriesKcal'), true);
  assert.equal(result.status, 'incomplete');
  assert.equal(['good', 'excellent'].includes(result.status), false);
});

test('evaluateDailyMeal does not add macro warnings when no foods are checked', () => {
  const summary = buildDailySummary(
    '2026-07-17',
    createEmptyMealsForDate('2026-07-17', timestamp),
  );
  const result = evaluateDailyMeal(summary, targets);

  assert.equal(result.status, 'incomplete');
  assert.equal(result.warnings.length, 0);
  assert.equal(result.messages.some((message) => message.includes('탄수화물')), false);
  assert.equal(result.messages.some((message) => message.includes('지방')), false);
});

test('evaluateDailyMeal adds carbohydrate and fat warnings outside 80-120 percent', () => {
  const result = evaluateDailyMeal(makeDailySummary({
    caloriesKcal: 2000,
    proteinG: 100,
    carbohydrateG: 150,
    fatG: 80,
  }), targets);

  assert.equal(result.status, 'excellent');
  assert.deepEqual(
    result.warnings.map((warning) => warning.code).sort(),
    ['carbohydrateLow', 'fatHigh'].sort(),
  );
  assert.equal(result.messages.some((message) => message.includes('탄수화물')), true);
  assert.equal(result.messages.some((message) => message.includes('지방')), true);
});

test('MealsByDate keeps selectedDate meal data separated by date', () => {
  const dateA = '2026-07-17';
  const dateB = '2026-07-18';
  const food: Food = {
    id: 'food-test',
    source: 'test',
    sourceFoodId: 'test-food',
    name: '테스트 음식',
    brandName: null,
    category: null,
    servingSize: 100,
    servingUnit: 'g',
    nutritionPerServing: makeNutrition({
      caloriesKcal: 200,
      carbohydrateG: 20,
      proteinG: 10,
      fatG: 5,
    }),
    updatedAt: timestamp,
  };
  const initialMealsByDate: MealsByDate = {
    [dateA]: createEmptyMealsForDate(dateA, timestamp),
  };

  const withDateAFood = updateMealsForDate(
    initialMealsByDate,
    dateA,
    (meals) => addFoodToMeals(meals, food, 'breakfast', 100, {
      createMealFoodId: (foodId) => `date-a-${foodId}`,
      updatedAt: timestamp,
    }),
    timestamp,
  );
  const withDateBFood = updateMealsForDate(
    withDateAFood,
    dateB,
    (meals) => addFoodToMeals(meals, food, 'dinner', 200, {
      createMealFoodId: (foodId) => `date-b-${foodId}`,
      updatedAt: timestamp,
    }),
    timestamp,
  );

  const dateASummary = buildDailySummary(dateA, withDateBFood[dateA]);
  const dateBSummary = buildDailySummary(dateB, withDateBFood[dateB]);

  assert.equal(dateASummary.checkedNutritionTotal.caloriesKcal, 200);
  assert.equal(dateASummary.mealSummaries[0].checkedCount, 1);
  assert.equal(dateASummary.mealSummaries[2].checkedCount, 0);
  assert.equal(dateBSummary.checkedNutritionTotal.caloriesKcal, 400);
  assert.equal(dateBSummary.mealSummaries[0].checkedCount, 0);
  assert.equal(dateBSummary.mealSummaries[2].checkedCount, 1);
});

test('shiftLocalDateString moves across month and year boundaries', () => {
  assert.equal(shiftLocalDateString('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftLocalDateString('2024-03-01', -1), '2024-02-29');
  assert.equal(shiftLocalDateString('2026-12-31', 1), '2027-01-01');
});
