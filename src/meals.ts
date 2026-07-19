import type { Food, Meal, MealFood, MealsByDate, MealType } from './models';
import { calculateNutritionForConsumedGrams } from './nutrition';

export type AddFoodToMealsOptions = {
  createMealFoodId: (foodId: string) => string;
  updatedAt: string;
};

export const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner'];

export function createEmptyMealsForDate(
  date: string,
  timestamp = new Date().toISOString(),
): Meal[] {
  return mealTypes.map((type) => ({
    id: `meal-${date}-${type}`,
    date,
    type,
    foods: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

export function getMealsForDate(mealsByDate: MealsByDate, date: string): Meal[] {
  return mealsByDate[date] ?? createEmptyMealsForDate(date);
}

export function updateMealsForDate(
  mealsByDate: MealsByDate,
  date: string,
  updateMeals: (meals: Meal[]) => Meal[],
  timestamp = new Date().toISOString(),
): MealsByDate {
  const currentMeals = mealsByDate[date] ?? createEmptyMealsForDate(date, timestamp);

  return {
    ...mealsByDate,
    [date]: updateMeals(currentMeals),
  };
}

export function normalizeConsumedGrams(consumedGrams: number): number {
  return Number.isFinite(consumedGrams) && consumedGrams > 0
    ? consumedGrams
    : 0;
}

export function hasValidGramServing(
  food: Food,
): food is Food & { servingSize: number; servingUnit: 'g' } {
  return food.servingSize !== null
    && Number.isFinite(food.servingSize)
    && food.servingSize > 0
    && food.servingUnit === 'g';
}

export function addFoodToMeals(
  meals: Meal[],
  food: Food,
  mealType: MealType,
  consumedGrams: number,
  options: AddFoodToMealsOptions,
): Meal[] {
  const normalizedConsumedGrams = normalizeConsumedGrams(consumedGrams);

  if (!hasValidGramServing(food) || normalizedConsumedGrams <= 0) {
    return meals;
  }

  return meals.map((meal) => {
    if (meal.type !== mealType) {
      return meal;
    }

    const matchingMealFoods = meal.foods.filter(
      (mealFood) => mealFood.foodId === food.id,
    );

    if (matchingMealFoods.length > 0) {
      const [firstMatchingMealFood] = matchingMealFoods;
      const mergedConsumedGrams = matchingMealFoods.reduce(
        (totalConsumedGrams, mealFood) =>
          totalConsumedGrams + normalizeConsumedGrams(mealFood.consumedGrams),
        normalizedConsumedGrams,
      );
      const mergedChecked = matchingMealFoods.some((mealFood) => mealFood.checked);
      const mergedNutrition = calculateNutritionForConsumedGrams(
        food.nutritionPerServing,
        mergedConsumedGrams,
        food.servingSize,
      );

      return {
        ...meal,
        updatedAt: options.updatedAt,
        foods: meal.foods.reduce<MealFood[]>((updatedFoods, mealFood) => {
          if (mealFood.foodId !== food.id) {
            return [...updatedFoods, mealFood];
          }

          if (mealFood.id !== firstMatchingMealFood.id) {
            return updatedFoods;
          }

          return [
            ...updatedFoods,
            {
              ...mealFood,
              consumedGrams: mergedConsumedGrams,
              checked: mergedChecked,
              calculatedNutrition: mergedNutrition,
              updatedAt: options.updatedAt,
            },
          ];
        }, []),
      };
    }

    const mealFood: MealFood = {
      id: options.createMealFoodId(food.id),
      foodId: food.id,
      mealId: meal.id,
      consumedGrams: normalizedConsumedGrams,
      checked: true,
      calculatedNutrition: calculateNutritionForConsumedGrams(
        food.nutritionPerServing,
        normalizedConsumedGrams,
        food.servingSize,
      ),
      createdAt: options.updatedAt,
      updatedAt: options.updatedAt,
    };

    return {
      ...meal,
      updatedAt: options.updatedAt,
      foods: [...meal.foods, mealFood],
    };
  });
}
