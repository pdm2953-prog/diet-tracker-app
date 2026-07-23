import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyFixedMealTemplatesToMeals,
  createPromotedFixedMealTemplateIds,
  promoteMealFoodInMeals,
  promoteMealFoodToFixedMeal,
} from '../src/fixedMeals';
import { createEmptyMealsForDate } from '../src/meals';
import type {
  FixedMealTemplate,
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
}: {
  fixedMealTemplates?: FixedMealTemplate[];
  food: Food;
  mealFood: MealFood;
  mealType?: MealType;
}) {
  const ids = createPromotedFixedMealTemplateIds(mealType, mealFood);

  return promoteMealFoodToFixedMeal({
    fixedMealTemplates,
    food,
    mealFood,
    mealType,
    templateId: ids.templateId,
    templateItemId: ids.templateItemId,
    timestamp,
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