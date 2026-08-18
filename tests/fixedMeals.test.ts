import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyFixedMealTemplatesToMeals,
  createPromotedFixedMealTemplateIds,
  removeFixedMealTemplateById,
  setFixedMealTemplateActive,
  setFixedMealTemplateWeekdays,
  toggleFixedMealTemplateWeekday,
  promoteMealFoodInMeals,
  promoteMealFoodToFixedMeal,
} from '../src/fixedMeals';
import {
  allFixedMealWeekdays,
  fixedMealWeekdayPresets,
  getFixedMealWeekdayForDate,
} from '../src/fixedMealRecurrence';
import { createEmptyMealsForDate } from '../src/meals';
import type {
  FixedMealTemplate,
  FixedMealWeekday,
  Food,
  Meal,
  MealFood,
  MealType,
  Nutrition,
} from '../src/models';
import {
  calculateNutritionForConsumedGrams,
  createZeroNutrition,
} from '../src/nutrition';

const timestamp = '2026-07-23T00:00:00.000Z';
const todayDate = '2026-07-23';
const nextDate = '2026-07-24';

function makeNutrition(overrides: Partial<Nutrition> = {}): Nutrition {
  return {
    ...createZeroNutrition(),
    ...overrides,
  };
}

function makeFood(id = 'food-rice'): Food {
  return {
    id,
    source: 'test',
    sourceFoodId: id,
    name: id,
    brandName: null,
    category: 'test',
    servingSize: 100,
    servingUnit: 'g',
    nutritionPerServing: makeNutrition({
      caloriesKcal: 200,
      carbohydrateG: 30,
      proteinG: 20,
      fatG: 5,
    }),
    updatedAt: timestamp,
  };
}

function makeMealFood({
  checked = true,
  consumedGrams = 150,
  food,
  id = 'direct-food',
  mealId = `meal-${todayDate}-breakfast`,
}: {
  checked?: boolean;
  consumedGrams?: number;
  food: Food;
  id?: string;
  mealId?: string;
}): MealFood {
  return {
    id,
    foodId: food.id,
    mealId,
    consumedGrams,
    checked,
    calculatedNutrition: calculateNutritionForConsumedGrams(
      food.nutritionPerServing,
      consumedGrams,
      food.servingSize ?? 100,
    ),
    createdAt: timestamp,
    updatedAt: timestamp,
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

function promoteDirectMealFood({
  fixedMealTemplates = [],
  food,
  mealFood,
  mealType = 'breakfast',
  weekdays = allFixedMealWeekdays,
}: {
  fixedMealTemplates?: FixedMealTemplate[];
  food: Food;
  mealFood: MealFood;
  mealType?: MealType;
  weekdays?: readonly FixedMealWeekday[];
}) {
  const ids = createPromotedFixedMealTemplateIds(mealType, mealFood, weekdays);

  return promoteMealFoodToFixedMeal({
    fixedMealTemplates,
    food,
    mealFood,
    mealType,
    templateId: ids.templateId,
    templateItemId: ids.templateItemId,
    timestamp,
    weekdays,
  });
}

test('promoting a direct meal entry keeps the current date item count unchanged', () => {
  const food = makeFood();
  const mealFood = makeMealFood({ food });
  const meals = makeMeals(todayDate, 'breakfast', [mealFood]);
  const promotion = promoteDirectMealFood({ food, mealFood: meals[0].foods[0] });

  assert.equal(promotion.fixedMealTemplates.length, 1);
  assert.equal(promotion.sourceFields === null, false);

  const promotedMeals = promoteMealFoodInMeals({
    mealFoodId: meals[0].foods[0].id,
    meals,
    sourceFields: promotion.sourceFields!,
    timestamp,
  });
  const promotedFoods = promotedMeals.flatMap((meal) => meal.foods);
  const promotedFood = promotedFoods[0];

  assert.equal(promotedFoods.length, 1);
  assert.equal(promotedFood.id, mealFood.id);
  assert.equal(promotedFood.generatedFromFixedMealTemplateId, promotion.fixedMealTemplates[0].id);
  assert.equal(
    promotedFood.generatedFromFixedMealTemplateItemId,
    promotion.fixedMealTemplates[0].items[0].id,
  );
  assert.equal(promotedFood.fixedMealTemplateItemId, promotion.fixedMealTemplates[0].items[0].id);
  assert.equal(promotedFood.generatedFromFixedMealSourceKey, promotion.sourceFields!.sourceKey);
  assert.equal(promotedFood.sourceKey, promotion.sourceFields!.sourceKey);
  assert.equal(promotedFood.checked, true);
  assert.equal(promotedFood.consumedGrams, 150);
});

test('repeating fixed promotion does not duplicate templates or meal rows', () => {
  const food = makeFood();
  const mealFood = makeMealFood({ food });
  const meals = makeMeals(todayDate, 'breakfast', [mealFood]);
  const firstPromotion = promoteDirectMealFood({ food, mealFood: meals[0].foods[0] });
  const firstMeals = promoteMealFoodInMeals({
    mealFoodId: meals[0].foods[0].id,
    meals,
    sourceFields: firstPromotion.sourceFields!,
    timestamp,
  });
  const promotedMealFood = firstMeals[0].foods[0];
  const secondPromotion = promoteDirectMealFood({
    fixedMealTemplates: firstPromotion.fixedMealTemplates,
    food,
    mealFood: promotedMealFood,
  });
  const secondMeals = promoteMealFoodInMeals({
    mealFoodId: promotedMealFood.id,
    meals: firstMeals,
    sourceFields: secondPromotion.sourceFields!,
    timestamp,
  });

  assert.equal(secondPromotion.fixedMealTemplates.length, 1);
  assert.equal(secondMeals.flatMap((meal) => meal.foods).length, 1);
});

test('promoted templates generate one unchecked fixed meal on the next date', () => {
  const food = makeFood();
  const mealFood = makeMealFood({ food });
  const promotion = promoteDirectMealFood({ food, mealFood });
  const nextMeals = applyFixedMealTemplatesToMeals({
    date: nextDate,
    fixedMealTemplates: promotion.fixedMealTemplates,
    hiddenSourceKeys: [],
    meals: createEmptyMealsForDate(nextDate, timestamp),
    timestamp,
  });
  const reappliedNextMeals = applyFixedMealTemplatesToMeals({
    date: nextDate,
    fixedMealTemplates: promotion.fixedMealTemplates,
    hiddenSourceKeys: [],
    meals: nextMeals,
    timestamp,
  });
  const nextFoods = nextMeals.flatMap((meal) => meal.foods);

  assert.equal(nextFoods.length, 1);
  assert.equal(nextFoods[0].checked, false);
  assert.equal(nextFoods[0].sourceKey, promotion.sourceFields!.sourceKey);
  assert.equal(reappliedNextMeals.flatMap((meal) => meal.foods).length, 1);
});

test('promoting to an existing active template reuses it and removes the generated duplicate row', () => {
  const food = makeFood();
  const firstMealFood = makeMealFood({ food, id: 'first-direct-food' });
  const firstPromotion = promoteDirectMealFood({ food, mealFood: firstMealFood });
  const secondMealFood = makeMealFood({ food, id: 'second-direct-food' });
  const secondMeals = makeMeals(todayDate, 'breakfast', [secondMealFood]);
  const visibleMealsWithDuplicate = applyFixedMealTemplatesToMeals({
    date: todayDate,
    fixedMealTemplates: firstPromotion.fixedMealTemplates,
    hiddenSourceKeys: [],
    meals: secondMeals,
    timestamp,
  });

  assert.equal(visibleMealsWithDuplicate.flatMap((meal) => meal.foods).length, 2);

  const secondPromotion = promoteDirectMealFood({
    fixedMealTemplates: firstPromotion.fixedMealTemplates,
    food,
    mealFood: secondMeals[0].foods[0],
  });
  const promotedMeals = promoteMealFoodInMeals({
    mealFoodId: secondMeals[0].foods[0].id,
    meals: visibleMealsWithDuplicate,
    sourceFields: secondPromotion.sourceFields!,
    timestamp,
  });
  const promotedFoods = promotedMeals.flatMap((meal) => meal.foods);

  assert.equal(secondPromotion.createdTemplate, false);
  assert.equal(secondPromotion.fixedMealTemplates.length, 1);
  assert.equal(promotedFoods.length, 1);
  assert.equal(promotedFoods[0].id, secondMealFood.id);
  assert.equal(promotedFoods[0].sourceKey, firstPromotion.sourceFields!.sourceKey);
});
test('promoted fixed meal templates default to every weekday and encode non-daily weekday identity', () => {
  const food = makeFood();
  const mealFood = makeMealFood({ food });
  const defaultPromotion = promoteDirectMealFood({ food, mealFood });
  const weekdayIds = createPromotedFixedMealTemplateIds('breakfast', mealFood, ['mon', 'wed']);
  const dailyIds = createPromotedFixedMealTemplateIds('breakfast', mealFood);

  assert.deepEqual(defaultPromotion.fixedMealTemplates[0].weekdays, allFixedMealWeekdays);
  assert.equal(weekdayIds.templateId === dailyIds.templateId, false);
});

test('fixed meal recurrence applies only on selected local weekdays', () => {
  const tomato = makeFood('food-tomato');
  const banana = makeFood('food-banana-weekday');
  const tomatoPromotion = promoteDirectMealFood({
    food: tomato,
    mealFood: makeMealFood({ food: tomato, id: 'tomato-direct' }),
    weekdays: ['mon', 'wed'],
  });
  const bananaPromotion = promoteDirectMealFood({
    fixedMealTemplates: tomatoPromotion.fixedMealTemplates,
    food: banana,
    mealFood: makeMealFood({ food: banana, id: 'banana-direct' }),
    weekdays: ['tue', 'thu'],
  });
  const templates = bananaPromotion.fixedMealTemplates;
  const foodIdsForDate = (date: string) => applyFixedMealTemplatesToMeals({
    date,
    fixedMealTemplates: templates,
    hiddenSourceKeys: [],
    meals: createEmptyMealsForDate(date, timestamp),
    timestamp,
  }).flatMap((meal) => meal.foods.map((mealFood) => mealFood.foodId));

  assert.deepEqual(foodIdsForDate('2026-08-17'), ['food-tomato']);
  assert.deepEqual(foodIdsForDate('2026-08-18'), ['food-banana-weekday']);
  assert.deepEqual(foodIdsForDate('2026-08-19'), ['food-tomato']);
  assert.deepEqual(foodIdsForDate('2026-08-20'), ['food-banana-weekday']);
  assert.deepEqual(foodIdsForDate('2026-08-21'), []);
});

test('fixed meal weekday presets cover weekdays, weekends, and Sunday to Monday local date boundary', () => {
  assert.equal(getFixedMealWeekdayForDate('2026-08-16'), 'sun');
  assert.equal(getFixedMealWeekdayForDate('2026-08-17'), 'mon');
  assert.deepEqual(fixedMealWeekdayPresets.find((preset) => preset.key === 'weekday')?.weekdays, [
    'mon',
    'tue',
    'wed',
    'thu',
    'fri',
  ]);
  assert.deepEqual(fixedMealWeekdayPresets.find((preset) => preset.key === 'weekend')?.weekdays, ['sat', 'sun']);
});

test('inactive fixed meal schedules do not project into meals and delete removes the template', () => {
  const food = makeFood();
  const promotion = promoteDirectMealFood({ food, mealFood: makeMealFood({ food }) });
  const inactiveTemplates = setFixedMealTemplateActive(
    promotion.fixedMealTemplates,
    promotion.fixedMealTemplates[0].id,
    false,
    '2026-07-23T01:00:00.000Z',
  );
  const projectedMeals = applyFixedMealTemplatesToMeals({
    date: nextDate,
    fixedMealTemplates: inactiveTemplates,
    hiddenSourceKeys: [],
    meals: createEmptyMealsForDate(nextDate, timestamp),
    timestamp,
  });

  assert.equal(inactiveTemplates[0].isActive, false);
  assert.equal(projectedMeals.flatMap((meal) => meal.foods).length, 0);
  assert.deepEqual(removeFixedMealTemplateById(inactiveTemplates, inactiveTemplates[0].id), []);
});

test('weekday editing persists at least one selected day and repeated reconciliation stays deduped', () => {
  const food = makeFood();
  const promotion = promoteDirectMealFood({ food, mealFood: makeMealFood({ food }) });
  const templateId = promotion.fixedMealTemplates[0].id;
  const saturdayOnlyTemplates = setFixedMealTemplateWeekdays(
    promotion.fixedMealTemplates,
    templateId,
    ['sat'],
    '2026-07-23T01:00:00.000Z',
  );
  const unchangedTemplates = setFixedMealTemplateWeekdays(
    saturdayOnlyTemplates,
    templateId,
    [],
    '2026-07-23T02:00:00.000Z',
  );
  const stillSaturdayTemplates = toggleFixedMealTemplateWeekday(
    unchangedTemplates,
    templateId,
    'sat',
    '2026-07-23T03:00:00.000Z',
  );
  const firstProjection = applyFixedMealTemplatesToMeals({
    date: '2026-08-22',
    fixedMealTemplates: stillSaturdayTemplates,
    hiddenSourceKeys: [],
    meals: createEmptyMealsForDate('2026-08-22', timestamp),
    timestamp,
  });
  const secondProjection = applyFixedMealTemplatesToMeals({
    date: '2026-08-22',
    fixedMealTemplates: stillSaturdayTemplates,
    hiddenSourceKeys: [],
    meals: firstProjection,
    timestamp,
  });

  assert.deepEqual(saturdayOnlyTemplates[0].weekdays, ['sat']);
  assert.equal(unchangedTemplates, saturdayOnlyTemplates);
  assert.deepEqual(stillSaturdayTemplates[0].weekdays, ['sat']);
  assert.equal(firstProjection.flatMap((meal) => meal.foods).length, 1);
  assert.equal(secondProjection.flatMap((meal) => meal.foods).length, 1);
});



test('promoting an inactive equivalent fixed meal reactivates it instead of duplicating template ids', () => {
  const food = makeFood();
  const mealFood = makeMealFood({ food });
  const promotion = promoteDirectMealFood({ food, mealFood });
  const inactiveTemplates = setFixedMealTemplateActive(
    promotion.fixedMealTemplates,
    promotion.fixedMealTemplates[0].id,
    false,
    '2026-07-23T01:00:00.000Z',
  );
  const reactivatedPromotion = promoteDirectMealFood({
    fixedMealTemplates: inactiveTemplates,
    food,
    mealFood,
  });

  assert.equal(reactivatedPromotion.fixedMealTemplates.length, 1);
  assert.equal(reactivatedPromotion.fixedMealTemplates[0].id, promotion.fixedMealTemplates[0].id);
  assert.equal(reactivatedPromotion.fixedMealTemplates[0].isActive, true);
});
