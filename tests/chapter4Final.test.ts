import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fixedMealManagementLabel } from '../src/constants';
import { createSettingsGoalEntryModel, isNutritionGoalType } from '../src/goalPresentation';
import { buildDailySummary, dailyTargets } from '../src/nutrition';
import { nutritionGoalLabels } from '../src/nutritionGoals';
import { appScreenKeys, bottomTabs, getGoalSetupScreenKey } from '../src/navigation';
import type { DailySummary, Food, Meal, MealFood, MealSummary, Nutrition } from '../src/models';
import {
  calculateNutritionForConsumedGrams,
} from '../src/nutrition';
import {
  createCalorieHeroModel,
  createMacroMetricModels,
  createMealSectionModel,
  formatCompactNutritionNumber,
  mealSectionActionLabels,
} from '../src/todayPresentation';

const timestamp = '2026-08-18T00:00:00.000Z';

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

function makeFood(nutritionPerServing: Nutrition): Food {
  return {
    id: 'food-rice',
    source: 'test',
    sourceFoodId: 'rice',
    name: '현미밥',
    brandName: null,
    category: '곡류',
    servingSize: 100,
    servingUnit: 'g',
    nutritionPerServing,
    updatedAt: timestamp,
  };
}

function makeMealFood(
  checked: boolean,
  calculatedNutrition: Nutrition,
  consumedGrams = 100,
): MealFood {
  return {
    id: 'meal-food-rice',
    foodId: 'food-rice',
    mealId: 'meal-breakfast',
    consumedGrams,
    checked,
    calculatedNutrition,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

test('Chapter 4-D bottom nav exposes only Today, Calendar, Settings while Target route remains reusable', () => {
  assert.deepEqual(bottomTabs.map((tab) => tab.label), ['Today', 'Calendar', 'Settings']);
  assert.deepEqual(bottomTabs.map((tab) => tab.key), ['today', 'calendar', 'settings']);
  assert.equal(bottomTabs.some((tab) => String(tab.key) === 'target' || /Target|Goal|목표/.test(tab.label)), false);
  assert.equal(getGoalSetupScreenKey(), 'target');
  assert.equal(appScreenKeys.includes('target'), true);
});

test('Chapter 4-D Settings goal entry is rendered from current goal type and kcal target', () => {
  const entry = createSettingsGoalEntryModel(
    { ...dailyTargets, caloriesKcal: 2345 },
    'bulk',
  );

  assert.equal(entry.title, '목표 및 영양');
  assert.equal(entry.currentGoalLabel, nutritionGoalLabels.bulk);
  assert.equal(entry.dailyCalorieGoalLabel, '2,345 kcal');
  assert.equal(entry.resetLabel, '목표 재설정');
  assert.equal(isNutritionGoalType('diet'), true);
  assert.equal(isNutritionGoalType('view'), false);
});

test('Chapter 4-D Today calorie hero uses supplied calculated totals and targets', () => {
  const summary = {
    date: '2026-08-18',
    checkedCount: 2,
    checkedNutritionTotal: makeNutrition({ caloriesKcal: 1234 }),
    mealSummaries: [],
    missingNutritionFields: [],
    plannedNutritionTotal: makeNutrition({ caloriesKcal: 1600 }),
    totalCount: 4,
  };
  const hero = createCalorieHeroModel(summary, { ...dailyTargets, caloriesKcal: 2000 });

  assert.equal(hero.remainingLabel, '766');
  assert.equal(hero.contextLabel, '1,234 먹음 · 목표 2,000');
  assert.equal(hero.progressLabel, '62%');
  assert.equal(hero.progressWidth, '62%');
});

test('Chapter 4-D macro summary keeps existing protein, carbohydrate, and fat calculations', () => {
  const summary: DailySummary = {
    date: '2026-08-18',
    checkedCount: 2,
    checkedNutritionTotal: makeNutrition({
      carbohydrateG: 134,
      fatG: 42,
      proteinG: 82,
    }),
    mealSummaries: [],
    missingNutritionFields: ['fatG'],
    plannedNutritionTotal: makeNutrition(),
    totalCount: 4,
  };
  const macros = createMacroMetricModels(summary, {
    caloriesKcal: 2600,
    carbohydrateG: 280,
    fatG: 65,
    proteinG: 140,
  });

  assert.deepEqual(macros.map((macro) => macro.label), ['단백질', '탄수화물', '지방']);
  assert.deepEqual(macros.map((macro) => macro.valueLabel), [
    '82 / 140g',
    '134 / 280g',
    '42 / 65g',
  ]);
  assert.equal(macros.find((macro) => macro.field === 'fatG')?.isMissing, true);
});

test('Chapter 4 polish displays missing macro current value as a dash without changing unknown nutrition', () => {
  const meal: Meal = {
    id: 'meal-breakfast',
    date: '2026-08-18',
    type: 'breakfast',
    foods: [makeMealFood(true, makeNutrition({
      caloriesKcal: 180,
      carbohydrateG: null,
      fatG: 5,
      proteinG: 12,
    }))],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const summary = buildDailySummary('2026-08-18', [meal]);
  const macros = createMacroMetricModels(summary, {
    caloriesKcal: 2000,
    carbohydrateG: 157.6,
    fatG: 42,
    proteinG: 126,
  });
  const carbohydrate = macros.find((macro) => macro.field === 'carbohydrateG');

  assert.equal(summary.checkedNutritionTotal.carbohydrateG, null);
  assert.equal(carbohydrate?.valueLabel, '— / 157.6g');
  assert.equal(carbohydrate?.progressWidth, '0%');
  assert.equal(carbohydrate?.isMissing, true);
  assert.deepEqual(macros.map((macro) => macro.valueLabel), [
    '12 / 126g',
    '— / 157.6g',
    '5 / 42g',
  ]);
  assert.equal(macros.every((macro) => !macro.valueLabel.includes('정보 없음')), true);
  assert.equal(macros.every((macro) => !macro.valueLabel.includes('\n')), true);
  assert.equal(macros.every((macro) => /^(?:—|[\d,.]+) \/ [\d,.]+g$/.test(macro.valueLabel)), true);
});

test('Chapter 5-A keeps Today fixed meal management as a meal-section action without making Settings its route', () => {
  assert.equal(mealSectionActionLabels.addFood, '음식 추가');
  assert.equal(mealSectionActionLabels.manageFixedMeals, fixedMealManagementLabel);
  assert.equal(bottomTabs.some((tab) => tab.key === 'settings'), true);
  assert.equal(appScreenKeys.includes('target'), true);
});

test('Chapter 4-D meal section model keeps meal calories, completion, and missing nutrition state', () => {
  const mealSummary: MealSummary = {
    mealId: 'meal-breakfast',
    type: 'breakfast',
    checkedCount: 2,
    checkedNutritionTotal: makeNutrition({ caloriesKcal: 420 }),
    missingNutritionFields: ['proteinG'],
    plannedNutritionTotal: makeNutrition({ caloriesKcal: 540 }),
    totalCount: 3,
  };
  const mealModel = createMealSectionModel(3, mealSummary);

  assert.equal(mealModel.calorieLabel, '420 kcal');
  assert.equal(mealModel.completionLabel, '2 / 3 완료');
  assert.equal(mealModel.hasMissingNutrition, true);
});

test('Chapter 4-D food row data primitives still support checked state and gram scaling', () => {
  const servingNutrition = makeNutrition({
    caloriesKcal: 200,
    carbohydrateG: 50,
    fatG: 4,
    proteinG: 10,
  });
  const scaledNutrition = calculateNutritionForConsumedGrams(servingNutrition, 110, 100);
  const food = makeFood(servingNutrition);
  const checkedMealFood = makeMealFood(true, scaledNutrition, 110);
  const uncheckedMealFood = makeMealFood(false, scaledNutrition, 110);
  const checkedMeal: Meal = {
    id: 'meal-breakfast',
    date: '2026-08-18',
    type: 'breakfast',
    foods: [checkedMealFood],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const uncheckedMeal: Meal = {
    ...checkedMeal,
    foods: [uncheckedMealFood],
  };

  assert.equal(food.servingSize, 100);
  assert.equal(formatCompactNutritionNumber('caloriesKcal', scaledNutrition.caloriesKcal), '220');
  assert.equal(Math.round(buildDailySummary('2026-08-18', [checkedMeal]).checkedNutritionTotal.caloriesKcal ?? 0), 220);
  assert.equal(buildDailySummary('2026-08-18', [uncheckedMeal]).checkedNutritionTotal.caloriesKcal, 0);
});
