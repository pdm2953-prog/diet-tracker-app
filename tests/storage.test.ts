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
  name: 'storage food',
  brandName: null,
  category: null,
  servingSize: 100,
  servingUnit: 'g',
  nutritionPerServing: makeNutrition({ caloriesKcal: 100, proteinG: 10 }),
  updatedAt: timestamp,
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
