import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addFoodToMeals } from '../src/meals';
import type { Food, Meal, MealFood, MealType, Nutrition } from '../src/models';
import { buildDailySummary, calculateNutritionForConsumedGrams } from '../src/nutrition';

const timestamp = '2026-07-07T00:00:00.000Z';

function makeNutrition(overrides: Partial<Nutrition> = {}): Nutrition {
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
    ...overrides,
  };
}

const food: Food = {
  id: 'food-banana',
  source: 'test',
  sourceFoodId: 'test-banana',
  name: '바나나',
  brandName: null,
  category: '과일',
  servingSize: 100,
  servingUnit: 'g',
  nutritionPerServing: makeNutrition({
    caloriesKcal: 200,
    carbohydrateG: 50,
    proteinG: 10,
    fatG: 4,
  }),
  updatedAt: timestamp,
};

function makeFood(overrides: Partial<Food> = {}): Food {
  return {
    ...food,
    ...overrides,
  };
}

function makeMealFood(
  id: string,
  checked: boolean,
  consumedGrams: number,
  calculatedNutrition: Nutrition,
): MealFood {
  return {
    id,
    foodId: food.id,
    mealId: 'meal-breakfast',
    consumedGrams,
    checked,
    calculatedNutrition,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function makeMeal(type: MealType, foods: MealFood[]): Meal {
  return {
    id: `meal-${type}`,
    date: '2026-07-07',
    type,
    foods,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

test('buildDailySummary sums checked foods and excludes unchecked foods', () => {
  const checkedFood = makeMealFood(
    'meal-food-checked',
    true,
    50,
    makeNutrition({ caloriesKcal: 100, carbohydrateG: 25, proteinG: 5, fatG: 2 }),
  );
  const uncheckedFood = makeMealFood(
    'meal-food-unchecked',
    false,
    200,
    makeNutrition({ caloriesKcal: 900, carbohydrateG: 300, proteinG: 90, fatG: 40 }),
  );

  const summary = buildDailySummary('2026-07-07', [makeMeal('breakfast', [checkedFood, uncheckedFood])]);

  assert.equal(summary.checkedCount, 1);
  assert.equal(summary.totalCount, 2);
  assert.equal(summary.checkedNutritionTotal.caloriesKcal, 100);
  assert.equal(summary.checkedNutritionTotal.carbohydrateG, 25);
  assert.equal(summary.checkedNutritionTotal.proteinG, 5);
  assert.equal(summary.checkedNutritionTotal.fatG, 2);
  assert.equal(summary.plannedNutritionTotal.caloriesKcal, 1000);
});

test('buildDailySummary returns zero totals and no missing warnings when no foods are checked', () => {
  const uncheckedFood = makeMealFood(
    'meal-food-unchecked',
    false,
    50,
    makeNutrition({ caloriesKcal: null, carbohydrateG: null, proteinG: null, fatG: null }),
  );

  const summary = buildDailySummary('2026-07-07', [makeMeal('breakfast', [uncheckedFood])]);

  assert.equal(summary.checkedCount, 0);
  assert.equal(summary.checkedNutritionTotal.caloriesKcal, 0);
  assert.equal(summary.checkedNutritionTotal.carbohydrateG, 0);
  assert.equal(summary.checkedNutritionTotal.proteinG, 0);
  assert.equal(summary.checkedNutritionTotal.fatG, 0);
  assert.equal(summary.missingNutritionFields.length, 0);
  assert.equal(summary.mealSummaries[0].missingNutritionFields.length, 0);
});

test('addFoodToMeals does not add foods without a valid gram serving', () => {
  const meals = [makeMeal('breakfast', [])];
  const invalidFoods = [
    makeFood({ id: 'food-null-serving', servingSize: null }),
    makeFood({ id: 'food-zero-serving', servingSize: 0 }),
    makeFood({ id: 'food-negative-serving', servingSize: -10 }),
    makeFood({ id: 'food-piece-serving', servingSize: 1, servingUnit: '개' }),
  ];

  for (const invalidFood of invalidFoods) {
    const updatedMeals = addFoodToMeals(meals, invalidFood, 'breakfast', 50, {
      createMealFoodId: (foodId) => `created-${foodId}`,
      updatedAt: '2026-07-07T01:00:00.000Z',
    });

    assert.equal(updatedMeals, meals);
    assert.equal(updatedMeals[0].foods.length, 0);
  }
});

test('addFoodToMeals merges duplicate food ids by summing consumedGrams and preserving checked=true', () => {
  const firstExisting = makeMealFood(
    'meal-food-first',
    false,
    50,
    calculateNutritionForConsumedGrams(food.nutritionPerServing, 50, 100),
  );
  const secondExisting = makeMealFood(
    'meal-food-second',
    true,
    25,
    calculateNutritionForConsumedGrams(food.nutritionPerServing, 25, 100),
  );
  const meals = [makeMeal('breakfast', [firstExisting, secondExisting])];

  const updatedMeals = addFoodToMeals(meals, food, 'breakfast', 25, {
    createMealFoodId: (foodId) => `created-${foodId}`,
    updatedAt: '2026-07-07T01:00:00.000Z',
  });

  const mergedFoods = updatedMeals[0].foods;
  assert.equal(mergedFoods.length, 1);
  assert.equal(mergedFoods[0].id, 'meal-food-first');
  assert.equal(mergedFoods[0].consumedGrams, 100);
  assert.equal(mergedFoods[0].checked, true);
  assert.equal(mergedFoods[0].calculatedNutrition.carbohydrateG, 50);
  assert.equal(mergedFoods[0].calculatedNutrition.proteinG, 10);
});

test('addFoodToMeals keeps merged duplicate unchecked when all matches are unchecked', () => {
  const firstExisting = makeMealFood(
    'meal-food-first',
    false,
    50,
    calculateNutritionForConsumedGrams(food.nutritionPerServing, 50, 100),
  );
  const secondExisting = makeMealFood(
    'meal-food-second',
    false,
    25,
    calculateNutritionForConsumedGrams(food.nutritionPerServing, 25, 100),
  );
  const meals = [makeMeal('breakfast', [firstExisting, secondExisting])];

  const updatedMeals = addFoodToMeals(meals, food, 'breakfast', 25, {
    createMealFoodId: (foodId) => `created-${foodId}`,
    updatedAt: '2026-07-07T01:00:00.000Z',
  });

  const mergedFoods = updatedMeals[0].foods;
  assert.equal(mergedFoods.length, 1);
  assert.equal(mergedFoods[0].id, 'meal-food-first');
  assert.equal(mergedFoods[0].consumedGrams, 100);
  assert.equal(mergedFoods[0].checked, false);
  assert.equal(mergedFoods[0].calculatedNutrition.carbohydrateG, 50);
  assert.equal(mergedFoods[0].calculatedNutrition.proteinG, 10);
});

test('addFoodToMeals keeps FatSecret metadata food selectable with gram input', () => {
  const fatSecretFood = makeFood({
    id: 'fatsecret-123-456',
    sourceFoodId: '123',
    sourceFoodName: 'Chicken Breast',
    name: 'Chicken Breast',
    displayName: '닭가슴살',
    dataSource: 'fatsecret',
    sourceServingId: '456',
    servingDescription: '100 g',
    sourceRegion: 'KR',
    wasLocalized: true,
    displayLocale: 'ko-KR',
    localizer: 'korean_food_name',
  });
  const meals = [makeMeal('breakfast', [])];

  const updatedMeals = addFoodToMeals(meals, fatSecretFood, 'breakfast', 150, {
    createMealFoodId: (foodId) => `created-${foodId}`,
    updatedAt: '2026-07-07T01:00:00.000Z',
  });

  const mealFood = updatedMeals[0].foods[0];

  assert.equal(mealFood.foodId, 'fatsecret-123-456');
  assert.equal(fatSecretFood.name, 'Chicken Breast');
  assert.equal(fatSecretFood.sourceFoodName, 'Chicken Breast');
  assert.equal(fatSecretFood.displayName, '닭가슴살');
  assert.equal(fatSecretFood.wasLocalized, true);
  assert.equal(mealFood.consumedGrams, 150);
  assert.equal(mealFood.calculatedNutrition.caloriesKcal, 300);
  assert.equal(mealFood.calculatedNutrition.carbohydrateG, 75);
});

test('addFoodToMeals adds official soondubu curated food and scales 200g from 400g serving', () => {
  const soondubu = makeFood({
    id: 'curated-kr-generic-soondubu-jjigae',
    sourceFoodId: 'kr-generic-soondubu-jjigae',
    sourceFoodName: '순두부찌개',
    name: '순두부찌개',
    displayName: '순두부찌개',
    dataSource: 'curated',
    category: '찌개',
    catalogId: 'kr-generic-soondubu-jjigae',
    canonicalName: '순두부찌개',
    servingSize: 400,
    servingUnit: 'g',
    servingDescription: '400 g',
    nutritionPerServing: makeNutrition({
      caloriesKcal: 200,
      carbohydrateG: 8,
      proteinG: 14,
      fatG: 12,
    }),
    nutritionSource: {
      type: 'mfds',
      name: '식품안전나라',
      url: 'https://www.foodsafetykorea.go.kr/portal/board/boardDetail.do?bbs_no=bbs039&menu_grp=MENU_NEW03&menu_no=4847&ntctxt_no=22493',
      recordId: null,
      checkedAt: '2026-08-10',
    },
    verificationStatus: 'official',
  });
  const meals = [makeMeal('breakfast', [])];

  const updatedMeals = addFoodToMeals(meals, soondubu, 'breakfast', 200, {
    createMealFoodId: (foodId) => `created-${foodId}`,
    updatedAt: '2026-08-09T01:00:00.000Z',
  });

  const mealFood = updatedMeals[0].foods[0];

  assert.equal(mealFood.foodId, 'curated-kr-generic-soondubu-jjigae');
  assert.equal(mealFood.consumedGrams, 200);
  assert.equal(mealFood.calculatedNutrition.caloriesKcal, 100);
  assert.equal(mealFood.calculatedNutrition.carbohydrateG, 4);
  assert.equal(mealFood.calculatedNutrition.proteinG, 7);
  assert.equal(mealFood.calculatedNutrition.fatG, 6);
});
