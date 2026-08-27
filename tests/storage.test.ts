import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allFixedMealWeekdays } from '../src/fixedMealRecurrence';
import {
  GOAL_HISTORY_BASELINE_DATE,
  createBaselineNutritionGoalHistory,
  createNutritionGoalHistoryEntry,
} from '../src/goalHistory';
import type { AppDataSnapshot } from '../src/storage';
import {
  restoreAppDataSnapshot,
  serializeAppDataSnapshot,
} from '../src/storage';
import type { FixedMealTemplate, Food, Meal, Nutrition } from '../src/models';
import { createZeroNutrition } from '../src/nutrition';

const timestamp = '2026-07-23T00:00:00.000Z';

function makeNutrition(overrides: Partial<Nutrition> = {}): Nutrition {
  return {
    ...createZeroNutrition(),
    ...overrides,
  };
}

function makeGoalHistory(
  targets: AppDataSnapshot['todayTargets'],
  goalType: AppDataSnapshot['nutritionGoalType'] = 'maintain',
): AppDataSnapshot['goalHistory'] {
  return createBaselineNutritionGoalHistory(targets, goalType);
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

const fallbackTargets: AppDataSnapshot['todayTargets'] = {
  caloriesKcal: 2000,
  proteinG: 100,
  carbohydrateG: 250,
  fatG: 60,
};

const fallback: AppDataSnapshot = {
  fixedMealTemplates: [],
  foods: [food],
  goalHistory: makeGoalHistory(fallbackTargets),
  hiddenFixedMealSourceKeys: {},
  mealsByDate: { '2026-07-23': [meal] },
  nutritionGoalType: 'maintain',
  todayTargets: fallbackTargets,
};

test('restoreAppDataSnapshot round-trips valid versioned local data', () => {
  const roundTripTargets: AppDataSnapshot['todayTargets'] = {
    caloriesKcal: 2100,
    proteinG: 110,
    carbohydrateG: 260,
    fatG: 65,
  };
  const data: AppDataSnapshot = {
    fixedMealTemplates: [{
      id: 'template-storage',
      name: 'storage template',
      mealType: 'breakfast',
      schedule: 'daily',
      weekdays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
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
    goalHistory: makeGoalHistory(roundTripTargets),
    hiddenFixedMealSourceKeys: { '2026-07-23': ['template-storage:item-storage'] },
    mealsByDate: { '2026-07-23': [meal] },
    nutritionGoalType: 'maintain',
    todayTargets: roundTripTargets,
  };

  assert.deepEqual(restoreAppDataSnapshot(serializeAppDataSnapshot(data), fallback), data);
});

test('restoreAppDataSnapshot falls back to current goal type for legacy or invalid stored values', () => {
  const fallbackWithGoal: AppDataSnapshot = {
    ...fallback,
    nutritionGoalType: 'diet',
  };
  const legacyRawValue = JSON.stringify({
    version: 1,
    fixedMealTemplates: [],
    foods: [food],
    hiddenFixedMealSourceKeys: {},
    mealsByDate: { '2026-07-23': [meal] },
    todayTargets: fallback.todayTargets,
  });
  const invalidRawValue = JSON.stringify({
    version: 1,
    fixedMealTemplates: [],
    foods: [food],
    hiddenFixedMealSourceKeys: {},
    mealsByDate: { '2026-07-23': [meal] },
    nutritionGoalType: 'view',
    todayTargets: fallback.todayTargets,
  });

  const restoredLegacy = restoreAppDataSnapshot(legacyRawValue, fallbackWithGoal);
  const restoredInvalid = restoreAppDataSnapshot(invalidRawValue, fallbackWithGoal);

  assert.equal(restoredLegacy.nutritionGoalType, 'diet');
  assert.equal(restoredInvalid.nutritionGoalType, 'diet');
  assert.deepEqual(restoredLegacy.goalHistory, makeGoalHistory(fallback.todayTargets, 'diet'));
  assert.deepEqual(restoredInvalid.goalHistory, makeGoalHistory(fallback.todayTargets, 'diet'));
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
      checkedAt: '2026-08-10',
    },
    verificationStatus: 'reviewed',
  };
  const data: AppDataSnapshot = {
    fixedMealTemplates: [],
    foods: [curatedFood],
    goalHistory: makeGoalHistory(fallback.todayTargets),
    hiddenFixedMealSourceKeys: {},
    mealsByDate: {},
    nutritionGoalType: 'maintain',
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

test('restoreAppDataSnapshot preserves official soondubu curated food and meal nutrition snapshot', () => {
  const soondubuFood: Food = {
    ...food,
    id: 'curated-kr-generic-soondubu-jjigae',
    sourceFoodId: 'kr-generic-soondubu-jjigae',
    sourceFoodName: '순두부찌개',
    name: '순두부찌개',
    displayName: '순두부찌개',
    brandName: null,
    category: '찌개',
    catalogId: 'kr-generic-soondubu-jjigae',
    canonicalName: '순두부찌개',
    dataSource: 'curated',
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
  };
  const soondubuMeal: Meal = {
    ...meal,
    id: 'meal-2026-08-09-breakfast',
    date: '2026-08-09',
    foods: [{
      ...meal.foods[0],
      id: 'meal-food-soondubu',
      foodId: soondubuFood.id,
      mealId: 'meal-2026-08-09-breakfast',
      consumedGrams: 200,
      calculatedNutrition: makeNutrition({
        caloriesKcal: 100,
        carbohydrateG: 4,
        proteinG: 7,
        fatG: 6,
      }),
    }],
  };
  const data: AppDataSnapshot = {
    fixedMealTemplates: [],
    foods: [soondubuFood],
    goalHistory: makeGoalHistory(fallback.todayTargets),
    hiddenFixedMealSourceKeys: {},
    mealsByDate: { '2026-08-09': [soondubuMeal] },
    nutritionGoalType: 'maintain',
    todayTargets: fallback.todayTargets,
  };

  const restored = restoreAppDataSnapshot(serializeAppDataSnapshot(data), fallback);
  const restoredFood = restored.foods[0];
  const restoredMealFood = restored.mealsByDate['2026-08-09']?.[0]?.foods[0];

  assert.equal(restoredFood?.catalogId, 'kr-generic-soondubu-jjigae');
  assert.equal(restoredFood?.canonicalName, '순두부찌개');
  assert.equal(restoredFood?.dataSource, 'curated');
  assert.equal(restoredFood?.servingSize, 400);
  assert.equal(restoredFood?.nutritionPerServing.caloriesKcal, 200);
  assert.equal(restoredFood?.nutritionPerServing.carbohydrateG, 8);
  assert.deepEqual(restoredFood?.nutritionSource, soondubuFood.nutritionSource);
  assert.equal(restoredFood?.verificationStatus, 'official');
  assert.equal(restoredMealFood?.foodId, soondubuFood.id);
  assert.equal(restoredMealFood?.consumedGrams, 200);
  assert.equal(restoredMealFood?.calculatedNutrition.caloriesKcal, 100);
  assert.equal(restoredMealFood?.calculatedNutrition.carbohydrateG, 4);
  assert.equal(restoredMealFood?.calculatedNutrition.proteinG, 7);
  assert.equal(restoredMealFood?.calculatedNutrition.fatG, 6);
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
    goalHistory: makeGoalHistory(fallback.todayTargets),
    hiddenFixedMealSourceKeys: {},
    mealsByDate: { '2026-07-23': [futureMeal] },
    nutritionGoalType: 'maintain',
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
    nutritionGoalType: 'maintain',
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
    nutritionGoalType: 'maintain',
    todayTargets: { caloriesKcal: '2000' },
  }), fallback);

  assert.deepEqual(restored.fixedMealTemplates, fallback.fixedMealTemplates);
  assert.deepEqual(restored.foods, fallback.foods);
  assert.deepEqual(restored.hiddenFixedMealSourceKeys, fallback.hiddenFixedMealSourceKeys);
  assert.deepEqual(restored.mealsByDate, fallback.mealsByDate);
  assert.deepEqual(restored.todayTargets, fallback.todayTargets);
});


test('restoreAppDataSnapshot hydrates legacy and invalid fixed meal weekdays as daily all week', () => {
  const baseTemplate = {
    id: 'legacy-template-storage',
    name: 'legacy template',
    mealType: 'breakfast',
    schedule: 'daily',
    isActive: true,
    items: [{
      id: 'legacy-item-storage',
      foodId: food.id,
      foodSnapshot: food,
      consumedGrams: 100,
      calculatedNutrition: makeNutrition({ caloriesKcal: 100, proteinG: 10 }),
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const rawValue = JSON.stringify({
    version: 1,
    fixedMealTemplates: [
      baseTemplate,
      { ...baseTemplate, id: 'empty-weekdays-template', weekdays: [] },
      { ...baseTemplate, id: 'partial-weekdays-template', weekdays: ['mon', 'bogus', 'wed'] },
    ],
    foods: [food],
    goalHistory: makeGoalHistory(fallback.todayTargets),
    hiddenFixedMealSourceKeys: {},
    mealsByDate: {},
    nutritionGoalType: 'maintain',
    todayTargets: fallback.todayTargets,
  });

  const restored = restoreAppDataSnapshot(rawValue, fallback);

  assert.deepEqual(restored.fixedMealTemplates[0]?.weekdays, allFixedMealWeekdays);
  assert.deepEqual(restored.fixedMealTemplates[1]?.weekdays, allFixedMealWeekdays);
  assert.deepEqual(restored.fixedMealTemplates[2]?.weekdays, ['mon', 'wed']);
});

test('restoreAppDataSnapshot normalizes malformed fixed meal weekday arrays without dropping templates', () => {
  const baseTemplate = {
    id: 'weekday-normalization-template',
    name: 'weekday normalization template',
    mealType: 'breakfast',
    schedule: 'daily',
    isActive: true,
    items: [{
      id: 'weekday-normalization-item',
      foodId: food.id,
      foodSnapshot: food,
      consumedGrams: 100,
      calculatedNutrition: makeNutrition({ caloriesKcal: 100, proteinG: 10 }),
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const rawValue = JSON.stringify({
    version: 1,
    fixedMealTemplates: [
      { ...baseTemplate, id: 'duplicate-weekdays-template', weekdays: ['wed', 'mon', 'mon'] },
      { ...baseTemplate, id: 'non-array-weekdays-template', weekdays: 'mon' },
      { ...baseTemplate, id: 'fully-invalid-weekdays-template', weekdays: ['bogus'] },
    ],
    foods: [food],
    goalHistory: makeGoalHistory(fallback.todayTargets),
    hiddenFixedMealSourceKeys: {},
    mealsByDate: {},
    nutritionGoalType: 'maintain',
    todayTargets: fallback.todayTargets,
  });

  const restored = restoreAppDataSnapshot(rawValue, fallback);

  assert.equal(restored.fixedMealTemplates.length, 3);
  assert.deepEqual(restored.fixedMealTemplates[0]?.weekdays, ['mon', 'wed']);
  assert.deepEqual(restored.fixedMealTemplates[1]?.weekdays, allFixedMealWeekdays);
  assert.deepEqual(restored.fixedMealTemplates[2]?.weekdays, allFixedMealWeekdays);
});

test('fixed meal recurrence edits, inactive state, presets, and deletes persist through storage hydration', () => {
  const baseTemplate: FixedMealTemplate = {
    id: 'weekday-edit-template',
    name: 'weekday edit template',
    mealType: 'breakfast' as const,
    schedule: 'daily' as const,
    weekdays: ['mon', 'wed'],
    isActive: true,
    items: [{
      id: 'weekday-edit-item',
      foodId: food.id,
      foodSnapshot: food,
      consumedGrams: 100,
      calculatedNutrition: makeNutrition({ caloriesKcal: 100, proteinG: 10 }),
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const data: AppDataSnapshot = {
    fixedMealTemplates: [
      baseTemplate,
      {
        ...baseTemplate,
        id: 'inactive-template',
        isActive: false,
        weekdays: ['tue', 'thu'],
      },
      {
        ...baseTemplate,
        id: 'weekend-preset-template',
        weekdays: ['sat', 'sun'],
      },
    ],
    foods: [food],
    goalHistory: makeGoalHistory(fallback.todayTargets),
    hiddenFixedMealSourceKeys: {},
    mealsByDate: {},
    nutritionGoalType: 'maintain',
    todayTargets: fallback.todayTargets,
  };

  const restored = restoreAppDataSnapshot(serializeAppDataSnapshot(data), fallback);
  const deletedRestored = restoreAppDataSnapshot(
    serializeAppDataSnapshot({
      ...data,
      fixedMealTemplates: data.fixedMealTemplates.filter((template) => template.id !== 'weekday-edit-template'),
    }),
    fallback,
  );

  assert.deepEqual(restored.fixedMealTemplates[0]?.weekdays, ['mon', 'wed']);
  assert.equal(restored.fixedMealTemplates[1]?.isActive, false);
  assert.deepEqual(restored.fixedMealTemplates[1]?.weekdays, ['tue', 'thu']);
  assert.deepEqual(restored.fixedMealTemplates[2]?.weekdays, ['sat', 'sun']);
  assert.deepEqual(
    deletedRestored.fixedMealTemplates.map((template) => template.id),
    ['inactive-template', 'weekend-preset-template'],
  );
});

function makeRawSnapshot(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 1,
    fixedMealTemplates: [],
    foods: [food],
    hiddenFixedMealSourceKeys: {},
    mealsByDate: { '2026-07-23': [meal] },
    nutritionGoalType: 'maintain',
    todayTargets: fallback.todayTargets,
    ...overrides,
  });
}

test('restoreAppDataSnapshot uses persisted compatibility targets for empty or all-invalid goal history', () => {
  const legacyTargets: AppDataSnapshot['todayTargets'] = {
    caloriesKcal: 2450,
    proteinG: 155,
    carbohydrateG: 275,
    fatG: 72,
  };
  const expectedLegacyHistory = createBaselineNutritionGoalHistory(legacyTargets, 'bulk');
  const emptyHistoryRawValue = makeRawSnapshot({
    goalHistory: [],
    nutritionGoalType: 'bulk',
    todayTargets: legacyTargets,
  });
  const allInvalidHistoryRawValue = makeRawSnapshot({
    goalHistory: [
      null,
      { effectiveDate: '2026-02-29', goalType: 'bulk', targets: legacyTargets },
      { effectiveDate: '2026-08-19', goalType: 'view', targets: legacyTargets },
      {
        effectiveDate: '2026-08-19',
        goalType: 'bulk',
        targets: { caloriesKcal: '2450', proteinG: 155, carbohydrateG: 275, fatG: 72 },
      },
    ],
    nutritionGoalType: 'bulk',
    todayTargets: legacyTargets,
  });

  const restoredEmptyHistory = restoreAppDataSnapshot(emptyHistoryRawValue, fallback, '2026-08-19');
  const restoredAllInvalidHistory = restoreAppDataSnapshot(allInvalidHistoryRawValue, fallback, '2026-08-19');

  assert.equal(expectedLegacyHistory[0].effectiveDate, GOAL_HISTORY_BASELINE_DATE);
  assert.deepEqual(restoredEmptyHistory.goalHistory, expectedLegacyHistory);
  assert.equal(restoredEmptyHistory.nutritionGoalType, 'bulk');
  assert.deepEqual(restoredEmptyHistory.todayTargets, legacyTargets);
  assert.deepEqual(restoredAllInvalidHistory.goalHistory, expectedLegacyHistory);
  assert.equal(restoredAllInvalidHistory.nutritionGoalType, 'bulk');
  assert.deepEqual(restoredAllInvalidHistory.todayTargets, legacyTargets);
});

test('restoreAppDataSnapshot ignores malformed goal history entries while preserving valid source of truth', () => {
  const conflictingCompatibilityTargets: AppDataSnapshot['todayTargets'] = {
    caloriesKcal: 9999,
    proteinG: 999,
    carbohydrateG: 999,
    fatG: 999,
  };
  const firstDuplicateTargets: AppDataSnapshot['todayTargets'] = {
    caloriesKcal: 2100,
    proteinG: 101,
    carbohydrateG: 251,
    fatG: 61,
  };
  const duplicateWinnerTargets: AppDataSnapshot['todayTargets'] = {
    caloriesKcal: 2200,
    proteinG: 111,
    carbohydrateG: 261,
    fatG: 66,
  };
  const futureTargets: AppDataSnapshot['todayTargets'] = {
    caloriesKcal: 1800,
    proteinG: 140,
    carbohydrateG: 170,
    fatG: 50,
  };
  const rawValue = makeRawSnapshot({
    goalHistory: [
      createNutritionGoalHistoryEntry('2026-08-25', 'bulk', futureTargets),
      { effectiveDate: '2026-02-29', goalType: 'diet', targets: firstDuplicateTargets },
      createNutritionGoalHistoryEntry('2026-08-01', 'diet', firstDuplicateTargets),
      { effectiveDate: '2026-08-10', goalType: 'view', targets: firstDuplicateTargets },
      {
        effectiveDate: '2026-08-10',
        goalType: 'maintain',
        targets: { caloriesKcal: 'bad', proteinG: 111, carbohydrateG: 261, fatG: 66 },
      },
      createNutritionGoalHistoryEntry('2026-08-01', 'maintain', duplicateWinnerTargets),
    ],
    nutritionGoalType: 'bulk',
    todayTargets: conflictingCompatibilityTargets,
  });

  const restored = restoreAppDataSnapshot(rawValue, fallback, '2026-08-19');

  assert.deepEqual(restored.goalHistory, [
    createNutritionGoalHistoryEntry('2026-08-01', 'maintain', duplicateWinnerTargets),
    createNutritionGoalHistoryEntry('2026-08-25', 'bulk', futureTargets),
  ]);
  assert.equal(restored.nutritionGoalType, 'maintain');
  assert.deepEqual(restored.todayTargets, duplicateWinnerTargets);
});
