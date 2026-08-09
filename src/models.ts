export type MealType = 'breakfast' | 'lunch' | 'dinner';

export type KnownFoodDataSource = 'mock' | 'fatsecret';
export type FoodDataSource = KnownFoodDataSource | (string & Record<never, never>);

export type NutritionSourceMetadata = {
  type: string;
  name: string;
  url: string | null;
  recordId: string | null;
  checkedAt: string;
};

export type NutritionVerificationStatus =
  | 'official'
  | 'reviewed'
  | 'estimated'
  | 'needs_verification'
  | (string & Record<never, never>);

export type FoodSearchQueryStatus = 'identity' | 'translated' | 'unresolved';

export type FoodSearchQueryMetadata = {
  original: string;
  resolved: string;
  wasTranslated: boolean;
  translator?: string;
  status?: FoodSearchQueryStatus;
};

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
  sourceFoodName?: string;
  name: string;
  displayName?: string;
  catalogId?: string;
  canonicalName?: string;
  brandName: string | null;
  category: string | null;
  servingSize: number | null;
  servingUnit: string | null;
  nutritionPerServing: Nutrition;
  updatedAt: string;
  dataSource?: FoodDataSource;
  sourceServingId?: string;
  servingDescription?: string;
  sourceRegion?: string;
  wasLocalized?: boolean;
  displayLocale?: string;
  localizer?: string;
  nutritionSource?: NutritionSourceMetadata;
  verificationStatus?: NutritionVerificationStatus;
};

export type MealFood = {
  id: string;
  foodId: string;
  mealId: string;
  consumedGrams: number;
  checked: boolean;
  calculatedNutrition: Nutrition;
  createdAt: string;
  updatedAt: string;
  generatedFromFixedMealTemplateId?: string;
  generatedFromFixedMealTemplateItemId?: string;
  generatedFromFixedMealSourceKey?: string;
  fixedMealTemplateItemId?: string;
  sourceKey?: string;
};

export type Meal = {
  id: string;
  date: string;
  type: MealType;
  foods: MealFood[];
  createdAt: string;
  updatedAt: string;
};

export type MealsByDate = Record<string, Meal[]>;

export type FixedMealSchedule = 'daily';

export type FixedMealTemplateItem = {
  id: string;
  foodId: string;
  foodSnapshot: Food;
  consumedGrams: number;
  calculatedNutrition: Nutrition;
  createdAt: string;
  updatedAt: string;
};

export type FixedMealTemplate = {
  id: string;
  name: string;
  mealType: MealType;
  schedule: FixedMealSchedule;
  isActive: boolean;
  items: FixedMealTemplateItem[];
  createdAt: string;
  updatedAt: string;
};

export type HiddenFixedMealSourceKeysByDate = Record<string, string[]>;

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
