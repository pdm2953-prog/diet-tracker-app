import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AppDataSnapshot } from '../src/storage';
import {
  restoreAppDataSnapshot,
  serializeAppDataSnapshot,
} from '../src/storage';
import type { Food, Meal, Nutrition } from '../src/models';
import { createZeroNutrition } from '../src/nutrition';

const timestamp = '2026-07-23T00:00:00.000Z';

function makeNutrition(overrides: Partial<Nutrition> = {}): Nutrition {
  return {
    ...createZeroNutrition(),
    ...overrides,
  };
}

const food: Food = {
  id: 'food-storage',
  source: 'test',
  sourceFoodId: 'food-storage',
  sourceFoodName: 'Storage Food Source',
  name: 'storage food',
  displayName: '저장 표시명',
  brandName: null,
  category: null,
  servingSize: 100,
  servingUnit: 'g',
  nutritionPerServing: makeNutrition({ caloriesKcal: 100, proteinG: 10 }),
  updatedAt: timestamp,
  dataSource: 'fatsecret',
  sourceServingId: 'serving-storage',
  servingDescription: '100 g',
  sourceRegion: 'KR',
  wasLocalized: true,
  displayLocale: 'ko-KR',
  localizer: 'korean_food_name',
};

const meal: Meal = {
  id: 'meal-2026-07-23-breakfast',
  date: '2026-07-23',
  type: 'breakfast',
  foods: [{
    id: 'meal-food-storage',
    foodId: food.id,
    mealId: 'meal-2026-07-23-breakfast',
    consumedGrams: 100,
    checked: true,
    calculatedNutrition: makeNutrition({ caloriesKcal: 100, proteinG: 10 }),
    createdAt: timestamp,
    updatedAt: timestamp,
    generatedFromFixedMealTemplateId: 'template-storage',
    generatedFromFixedMealTemplateItemId: 'item-storage',
    generatedFromFixedMealSourceKey: 'template-storage:item-storage',
    fixedMealTemplateItemId: 'item-storage',
    sourceKey: 'template-storage:item-storage',
  }],
  createdAt: timestamp,
  updatedAt: timestamp,
};

const fallback: AppDataSnapshot = {
  fixedMealTemplates: [],
  foods: [food],
  hiddenFixedMealSourceKeys: {},
  mealsByDate: { '2026-07-23': [meal] },
  todayTargets: {
    caloriesKcal: 2000,
    proteinG: 100,
    carbohydrateG: 250,
    fatG: 60,
  },
};

test('restoreAppDataSnapshot round-trips valid versioned local data', () => {
  const data: AppDataSnapshot = {
    fixedMealTemplates: [{
      id: 'template-storage',
      name: 'storage template',
      mealType: 'breakfast',
      schedule: 'daily',
      isActive: true,
      items: [{
        id: 'item-storage',
        foodId: food.id,
        foodSnapshot: food,
        consumedGrams: 100,
        calculatedNutrition: makeNutrition({ caloriesKcal: 100, proteinG: 10 }),
        createdAt: timestamp,
        updatedAt: timestamp,
      }],
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
    foods: [food],
    hiddenFixedMealSourceKeys: { '2026-07-23': ['template-storage:item-storage'] },
    mealsByDate: { '2026-07-23': [meal] },
    todayTargets: {
      caloriesKcal: 2100,
      proteinG: 110,
      carbohydrateG: 260,
      fatG: 65,
    },
  };

  assert.deepEqual(restoreAppDataSnapshot(serializeAppDataSnapshot(data), fallback), data);
});

test('restoreAppDataSnapshot preserves curated nutrition source metadata', () => {
  const curatedFood: Food = {
    ...food,
    id: 'food-curated',
    sourceFoodId: 'kr-bhc-test',
    sourceFoodName: '테스트치킨',
    catalogId: 'kr-bhc-kwasakking',
    canonicalName: '콰삭킹',
    dataSource: 'curated',
    nutritionPerServing: makeNutrition({
      caloriesKcal: null,
      proteinG: 20,
      carbohydrateG: 0,
      fatG: null,
    }),
    nutritionSource: {
      type: 'brand_official',
      name: '브랜드 공식 영양정보',
      url: 'https://example.test/official-nutrition',
      recordId: 'official-test-chicken',
      checkedAt: '2026-08-09',
    },
    verificationStatus: 'reviewed',
  };
  const data: AppDataSnapshot = {
    fixedMealTemplates: [],
    foods: [curatedFood],
    hiddenFixedMealSourceKeys: {},
    mealsByDate: {},
    todayTargets: fallback.todayTargets,
  };

  const restored = restoreAppDataSnapshot(serializeAppDataSnapshot(data), fallback);

  assert.equal(restored.foods[0]?.dataSource, 'curated');
  assert.equal(restored.foods[0]?.catalogId, 'kr-bhc-kwasakking');
  assert.equal(restored.foods[0]?.canonicalName, '콰삭킹');
  assert.equal(restored.foods[0]?.nutritionPerServing.caloriesKcal, null);
  assert.equal(restored.foods[0]?.nutritionPerServing.carbohydrateG, 0);
  assert.equal(restored.foods[0]?.nutritionPerServing.fatG, null);
  assert.deepEqual(restored.foods[0]?.nutritionSource, curatedFood.nutritionSource);
  assert.equal(restored.foods[0]?.verificationStatus, 'reviewed');
});
test('restoreAppDataSnapshot preserves future dataSource values without dropping foods or meal rows', () => {
  const futureFood: Food = {
    ...food,
    id: 'food-database',
    sourceFoodId: 'database-food-1',
    dataSource: 'database',
  };
  const futureMeal: Meal = {
    ...meal,
    foods: [{
      ...meal.foods[0],
      id: 'meal-food-database',
      foodId: futureFood.id,
    }],
  };
  const data: AppDataSnapshot = {
    fixedMealTemplates: [],
    foods: [futureFood],
    hiddenFixedMealSourceKeys: {},
    mealsByDate: { '2026-07-23': [futureMeal] },
    todayTargets: fallback.todayTargets,
  };

  const restored = restoreAppDataSnapshot(serializeAppDataSnapshot(data), fallback);

  assert.equal(restored.foods.length, 1);
  assert.equal(restored.foods[0]?.id, 'food-database');
  assert.equal(restored.foods[0]?.dataSource, 'database');
  assert.equal(restored.mealsByDate['2026-07-23']?.[0]?.foods[0]?.foodId, 'food-database');
});

test('restoreAppDataSnapshot omits malformed dataSource without dropping stored foods or meals', () => {
  const malformedFood = {
    ...food,
    id: 'food-malformed-source',
    dataSource: 123,
  };
  const malformedMeal = {
    ...meal,
    foods: [{
      ...meal.foods[0],
      id: 'meal-food-malformed-source',
      foodId: malformedFood.id,
    }],
  };
  const rawValue = JSON.stringify({
    version: 1,
    fixedMealTemplates: [],
    foods: [malformedFood],
    hiddenFixedMealSourceKeys: {},
    mealsByDate: { '2026-07-23': [malformedMeal] },
    todayTargets: fallback.todayTargets,
  });

  const restored = restoreAppDataSnapshot(rawValue, fallback);

  assert.equal(restored.foods.length, 1);
  assert.equal(restored.foods[0]?.id, 'food-malformed-source');
  assert.equal(restored.foods[0]?.dataSource, undefined);
  assert.equal(restored.mealsByDate['2026-07-23']?.[0]?.foods[0]?.foodId, 'food-malformed-source');
});
test('restoreAppDataSnapshot falls back for invalid JSON and unsupported versions', () => {
  assert.equal(restoreAppDataSnapshot('{bad json', fallback), fallback);
  assert.equal(restoreAppDataSnapshot(JSON.stringify({ version: 999 }), fallback), fallback);
});

test('restoreAppDataSnapshot safely falls back for invalid stored fields', () => {
  const restored = restoreAppDataSnapshot(JSON.stringify({
    version: 1,
    fixedMealTemplates: [{ id: 'bad-template' }],
    foods: [{ id: 'bad-food' }],
    hiddenFixedMealSourceKeys: { 'not-a-date': [123] },
    mealsByDate: { '2026-02-29': [] },
    todayTargets: { caloriesKcal: '2000' },
  }), fallback);

  assert.deepEqual(restored.fixedMealTemplates, fallback.fixedMealTemplates);
  assert.deepEqual(restored.foods, fallback.foods);
  assert.deepEqual(restored.hiddenFixedMealSourceKeys, fallback.hiddenFixedMealSourceKeys);
  assert.deepEqual(restored.mealsByDate, fallback.mealsByDate);
  assert.deepEqual(restored.todayTargets, fallback.todayTargets);
});
