import type { Food, NutritionField } from '../models';
import { primaryNutritionFields } from '../nutrition';
import type { PrimaryNutritionField } from '../nutrition';

export function isPrimaryNutritionField(
  field: NutritionField,
): field is PrimaryNutritionField {
  return (primaryNutritionFields as readonly NutritionField[]).includes(field);
}

export function getMissingPrimaryFields(
  nutrition: Food['nutritionPerServing'],
): PrimaryNutritionField[] {
  return primaryNutritionFields.filter((field) => nutrition[field] === null);
}
