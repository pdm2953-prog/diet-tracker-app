export type MealType = 'breakfast' | 'lunch' | 'dinner';

export type Nutrition = {
  caloriesKcal: number | null;
  carbohydrateG: number | null;
  proteinG: number | null;
  fatG: number | null;
  sugarsG: number | null;
  sodiumMg: number | null;
  fiberG: number | null;
  saturatedFatG: number | null;
  transFatG: number | null;
  cholesterolMg: number | null;
};

export type Food = {
  id: string;
  source: string;
  sourceFoodId: string;
  name: string;
  brandName: string | null;
  category: string | null;
  servingSize: number | null;
  servingUnit: string | null;
  nutritionPerServing: Nutrition;
  updatedAt: string;
};

export type MealFood = {
  id: string;
  foodId: string;
  mealId: string;
  quantity: number;
  amount: number;
  amountUnit: string;
  checked: boolean;
  calculatedNutrition: Nutrition;
  createdAt: string;
  updatedAt: string;
};

export type Meal = {
  id: string;
  date: string;
  type: MealType;
  foods: MealFood[];
  createdAt: string;
  updatedAt: string;
};

export type MealSummary = {
  mealId: string;
  type: MealType;
  checkedNutritionTotal: Nutrition;
  plannedNutritionTotal: Nutrition;
  missingNutritionFields: NutritionField[];
  checkedCount: number;
  totalCount: number;
};

export type DailySummary = {
  date: string;
  checkedNutritionTotal: Nutrition;
  plannedNutritionTotal: Nutrition;
  missingNutritionFields: NutritionField[];
  checkedCount: number;
  totalCount: number;
  mealSummaries: MealSummary[];
};

export type NutritionField = keyof Nutrition;
