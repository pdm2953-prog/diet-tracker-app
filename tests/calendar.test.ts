import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildCalendarDayDetails,
  countGroupedMealFoods,
} from '../src/calendar';
import {
  applyFixedMealTemplatesToMeals,
  createFixedMealSourceKey,
  hideFixedMealSourceKeyForDate,
} from '../src/fixedMeals';
import { createEmptyMealsForDate } from '../src/meals';
import type {
  FixedMealTemplate,
  Food,
  Meal,
  MealFood,
  MealsByDate,
  MealType,
  Nutrition,
} from '../src/models';
import { createZeroNutrition } from '../src/nutrition';
import type { DailyNutritionTargets } from '../src/nutrition';
import {
  buildCalendarMonthGrid,
  resolveSelectedCalendarDate,
  shiftCalendarMonth,
} from '../src/utils/date';

const timestamp = '2026-07-23T00:00:00.000Z';
const todayDate = '2026-07-23';
const targets: DailyNutritionTargets = {
  caloriesKcal: 2000,
  proteinG: 100,
  carbohydrateG: 250,
  fatG: 60,
};

function makeNutrition(overrides: Partial<Nutrition> = {}): Nutrition {
  return {
    ...createZeroNutrition(),
    ...overrides,
  };
}

function makeFood(id = 'food-rice', nutrition: Nutrition = makeNutrition({
  caloriesKcal: 300,
  carbohydrateG: 65,
  proteinG: 6,
  fatG: 1,
})): Food {
  return {
    id,
    source: 'test',
    sourceFoodId: id,
    name: id,
    brandName: null,
    category: 'test',
    servingSize: 100,
    servingUnit: 'g',
    nutritionPerServing: nutrition,
    updatedAt: timestamp,
  };
}

function makeMealFood({
  checked,
  foodId = 'food-rice',
  id,
  mealId = 'meal-2026-07-23-breakfast',
  nutrition,
  sourceKey,
}: {
  checked: boolean;
  foodId?: string;
  id: string;
  mealId?: string;
  nutrition: Nutrition;
  sourceKey?: string;
}): MealFood {
  return {
    id,
    foodId,
    mealId,
    consumedGrams: 100,
    checked,
    calculatedNutrition: nutrition,
    createdAt: timestamp,
    updatedAt: timestamp,
    generatedFromFixedMealTemplateId: sourceKey ? sourceKey.split(':')[0] : undefined,
    fixedMealTemplateItemId: sourceKey ? sourceKey.split(':')[1] : undefined,
    sourceKey,
  };
}

function makeMeals(date: string, mealType: MealType, foods: MealFood[]): Meal[] {
  return createEmptyMealsForDate(date, timestamp).map((meal) =>
    meal.type === mealType
      ? {
          ...meal,
          foods: foods.map((mealFood) => ({ ...mealFood, mealId: meal.id })),
        }
      : meal,
  );
}

function makeFixedTemplate({
  caloriesKcal = 500,
  itemId = 'item-breakfast',
  mealType = 'breakfast',
  proteinG = 30,
  templateId = 'template-daily',
}: {
  caloriesKcal?: number;
  itemId?: string;
  mealType?: MealType;
  proteinG?: number;
  templateId?: string;
} = {}): FixedMealTemplate {
  const nutrition = makeNutrition({ caloriesKcal, proteinG, carbohydrateG: 40, fatG: 12 });
  const food = makeFood(`food-${itemId}`, nutrition);

  return {
    id: templateId,
    name: '테스트 고정 식단',
    mealType,
    schedule: 'daily',
    isActive: true,
    items: [{
      id: itemId,
      foodId: food.id,
      foodSnapshot: food,
      consumedGrams: 100,
      calculatedNutrition: nutrition,
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildDetails({
  date = todayDate,
  fixedMealTemplates = [],
  hiddenFixedMealSourceKeys = {},
  mealsByDate = {},
}: Partial<Parameters<typeof buildCalendarDayDetails>[0]> = {}) {
  return buildCalendarDayDetails({
    date,
    fixedMealTemplates,
    hiddenFixedMealSourceKeys,
    mealsByDate,
    targets,
    todayDate,
  });
}

test('buildCalendarMonthGrid creates a stable 42-cell month grid with trailing and leading dates', () => {
  const grid = buildCalendarMonthGrid(2026, 7);

  assert.equal(grid.length, 42);
  assert.equal(grid[0].date, '2026-06-28');
  assert.equal(grid[3].date, '2026-07-01');
  assert.equal(grid[41].date, '2026-08-08');
  assert.equal(grid.filter((cell) => cell.isCurrentMonth).length, 31);
});

test('shiftCalendarMonth moves across previous and next year boundaries', () => {
  assert.deepEqual(shiftCalendarMonth({ year: 2026, month: 1 }, -1), {
    year: 2025,
    month: 12,
  });
  assert.deepEqual(shiftCalendarMonth({ year: 2026, month: 12 }, 1), {
    year: 2027,
    month: 1,
  });
});

test('buildCalendarMonthGrid handles leap-year February', () => {
  const grid = buildCalendarMonthGrid(2024, 2);

  assert.equal(grid.filter((cell) => cell.isCurrentMonth).length, 29);
  assert.equal(grid.some((cell) => cell.date === '2024-02-29' && cell.isCurrentMonth), true);
  assert.equal(grid[0].date, '2024-01-28');
});

test('future dates with active fixed meals are scheduled', () => {
  const details = buildDetails({
    date: '2026-07-24',
    fixedMealTemplates: [makeFixedTemplate()],
  });

  assert.equal(details.status, 'scheduled');
  assert.equal(details.evaluation, null);
  assert.equal(details.summary.totalCount, 1);
  assert.equal(details.summary.checkedCount, 0);
});

test('future dates are not evaluated as low, high, or incomplete', () => {
  const futureDate = '2026-07-24';
  const futureMealsByDate: MealsByDate = {
    [futureDate]: makeMeals(futureDate, 'breakfast', [makeMealFood({
      checked: true,
      id: 'future-low-food',
      nutrition: makeNutrition({ caloriesKcal: 100, proteinG: 5 }),
    })]),
  };
  const details = buildDetails({ date: futureDate, mealsByDate: futureMealsByDate });

  assert.equal(details.status, 'scheduled');
  assert.equal(details.evaluation, null);
  assert.equal(['low', 'high', 'incomplete'].includes(details.status), false);
});

test('resolveSelectedCalendarDate updates selectedDate only for valid local dates', () => {
  assert.equal(resolveSelectedCalendarDate('2024-02-29', '2026-07-23'), '2024-02-29');
  assert.equal(resolveSelectedCalendarDate('2026-02-29', '2026-07-23'), '2026-07-23');
});

test('calendar day summary includes only checked foods in consumed totals', () => {
  const mealsByDate: MealsByDate = {
    [todayDate]: makeMeals(todayDate, 'breakfast', [
      makeMealFood({
        checked: true,
        id: 'checked-food',
        nutrition: makeNutrition({ caloriesKcal: 100, proteinG: 10 }),
      }),
      makeMealFood({
        checked: false,
        id: 'unchecked-food',
        nutrition: makeNutrition({ caloriesKcal: 900, proteinG: 90 }),
      }),
    ]),
  };
  const details = buildDetails({ mealsByDate });

  assert.equal(details.summary.checkedCount, 1);
  assert.equal(details.summary.totalCount, 2);
  assert.equal(details.summary.checkedNutritionTotal.caloriesKcal, 100);
  assert.equal(details.summary.plannedNutritionTotal.caloriesKcal, 1000);
});

test('unchecked fixed meals remain listed but are excluded from consumed totals', () => {
  const details = buildDetails({ fixedMealTemplates: [makeFixedTemplate()] });

  assert.equal(details.status, 'scheduled');
  assert.equal(details.summary.checkedNutritionTotal.caloriesKcal, 0);
  assert.equal(countGroupedMealFoods(details.fixedMealFoodsByType), 1);
});

test('calendar details separate fixed meals from user-added meals by meal slot', () => {
  const mealsByDate: MealsByDate = {
    [todayDate]: makeMeals(todayDate, 'lunch', [makeMealFood({
      checked: true,
      id: 'direct-lunch-food',
      nutrition: makeNutrition({ caloriesKcal: 600, proteinG: 35 }),
    })]),
  };
  const details = buildDetails({
    fixedMealTemplates: [makeFixedTemplate({ mealType: 'breakfast' })],
    mealsByDate,
  });

  assert.equal(details.fixedMealFoodsByType.breakfast.length, 1);
  assert.equal(details.directMealFoodsByType.lunch.length, 1);
  assert.equal(countGroupedMealFoods(details.fixedMealFoodsByType), 1);
  assert.equal(countGroupedMealFoods(details.directMealFoodsByType), 1);
});

test('fixed template application preserves the parent meal id for existing meals', () => {
  const template = makeFixedTemplate();
  const customMealId = 'meal-breakfast';
  const meals = createEmptyMealsForDate(todayDate, timestamp).map((meal) =>
    meal.type === 'breakfast'
      ? { ...meal, id: customMealId }
      : meal,
  );
  const appliedMeals = applyFixedMealTemplatesToMeals({
    date: todayDate,
    fixedMealTemplates: [template],
    hiddenSourceKeys: [],
    meals,
    timestamp,
  });

  assert.equal(appliedMeals[0].foods[0].mealId, customMealId);
});
test('fixed template source keys prevent duplicate application on the same date', () => {
  const template = makeFixedTemplate();
  const sourceKey = createFixedMealSourceKey(template.id, template.items[0].id);
  const meals = applyFixedMealTemplatesToMeals({
    date: todayDate,
    fixedMealTemplates: [template],
    hiddenSourceKeys: [],
    meals: createEmptyMealsForDate(todayDate, timestamp),
    timestamp,
  });
  const reappliedMeals = applyFixedMealTemplatesToMeals({
    date: todayDate,
    fixedMealTemplates: [template],
    hiddenSourceKeys: [],
    meals,
    timestamp,
  });

  assert.equal(sourceKey, 'template-daily:item-breakfast');
  assert.equal(reappliedMeals.flatMap((meal) => meal.foods).length, 1);
});

test('hidden fixed meal source keys suppress only that date and reappear the next day', () => {
  const template = makeFixedTemplate();
  const sourceKey = createFixedMealSourceKey(template.id, template.items[0].id);
  const hidden = hideFixedMealSourceKeyForDate({}, todayDate, sourceKey);
  const todayDetails = buildDetails({
    fixedMealTemplates: [template],
    hiddenFixedMealSourceKeys: hidden,
  });
  const nextDetails = buildDetails({
    date: '2026-07-24',
    fixedMealTemplates: [template],
    hiddenFixedMealSourceKeys: hidden,
  });

  assert.equal(todayDetails.summary.totalCount, 0);
  assert.equal(nextDetails.status, 'scheduled');
  assert.equal(nextDetails.summary.totalCount, 1);
});

test('past fixed meal snapshots are preserved when templates change', () => {
  const pastDate = '2026-07-20';
  const template = makeFixedTemplate({ caloriesKcal: 900, proteinG: 70 });
  const sourceKey = createFixedMealSourceKey(template.id, template.items[0].id);
  const snapshotFood = makeMealFood({
    checked: true,
    id: 'past-fixed-snapshot',
    nutrition: makeNutrition({ caloriesKcal: 500, proteinG: 45 }),
    sourceKey,
  });
  const mealsByDate: MealsByDate = {
    [pastDate]: makeMeals(pastDate, 'breakfast', [snapshotFood]),
  };
  const details = buildDetails({
    date: pastDate,
    fixedMealTemplates: [template],
    mealsByDate,
  });

  assert.equal(details.summary.totalCount, 1);
  assert.equal(details.summary.checkedNutritionTotal.caloriesKcal, 500);
  assert.equal(details.fixedMealFoodsByType.breakfast[0].id, 'past-fixed-snapshot');
});
