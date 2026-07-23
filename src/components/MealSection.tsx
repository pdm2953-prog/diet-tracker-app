import type { ReactNode } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { Pressable, Text, View } from 'react-native';

import { mealLabels } from '../constants';
import { normalizeConsumedGrams } from '../meals';
import type { Food, Meal, MealFood, MealSummary, MealType } from '../models';
import {
  formatNutritionNumber,
  formatNutritionValue,
  nutritionLabels,
  nutritionUnits,
  primaryNutritionFields,
} from '../nutrition';
import { styles } from '../styles';
import { formatAmountLabel, formatServingText } from '../utils/format';
import { isPrimaryNutritionField } from '../utils/nutritionUi';
import { Card } from './ui';

type MealSectionProps = {
  foodsById: Record<string, Food>;
  meal: Meal;
  onDecreaseGrams: (mealId: string, mealFoodId: string) => void;
  onIncreaseGrams: (mealId: string, mealFoodId: string) => void;
  onOpenSearch: (mealType: MealType) => void;
  onRemoveFood: (mealId: string, mealFoodId: string) => void;
  onToggle: (mealId: string, mealFoodId: string) => void;
  searchPanel: ReactNode;
  summary: MealSummary | null | undefined;
};

export function MealSection({
  foodsById,
  meal,
  onDecreaseGrams,
  onIncreaseGrams,
  onOpenSearch,
  onRemoveFood,
  onToggle,
  searchPanel,
  summary,
}: MealSectionProps) {
  const calories = summary?.checkedNutritionTotal.caloriesKcal ?? null;
  const protein = summary?.checkedNutritionTotal.proteinG ?? null;

  return (
    <Card style={styles.mealSection}>
      <View style={styles.mealHeader}>
        <View>
          <View style={styles.mealTitleRow}>
            <Text style={styles.mealTitle}>{mealLabels[meal.type]}</Text>
            <Pressable
              accessibilityLabel={`${mealLabels[meal.type]} 음식 추가`}
              accessibilityRole="button"
              onPress={() => onOpenSearch(meal.type)}
              style={({ pressed }) => [
                styles.openSearchButton,
                pressed ? styles.openSearchButtonPressed : null,
              ]}
            >
              <Text style={styles.openSearchButtonText}>+</Text>
            </Pressable>
          </View>
          <Text style={styles.mealStatus}>
            {summary?.checkedCount ?? 0}/{summary?.totalCount ?? meal.foods.length}개 체크
          </Text>
        </View>
        {summary?.missingNutritionFields.some((field) =>
          isPrimaryNutritionField(field),
        ) ? (
          <Text style={styles.mealWarning}>일부 영양정보 없음</Text>
        ) : null}
      </View>

      <View style={styles.mealSummaryRow}>
        <Text style={styles.mealSummaryText}>
          칼로리 {formatNutritionValue('caloriesKcal', calories)}
        </Text>
        <Text style={styles.mealSummaryText}>
          단백질 {formatNutritionValue('proteinG', protein)}
        </Text>
      </View>

      {searchPanel}

      <View style={styles.foodList}>
        {meal.foods.length > 0 ? (
          meal.foods.map((mealFood, index) => (
            <FoodRow
              key={mealFood.id}
              food={foodsById[mealFood.foodId]}
              isLast={index === meal.foods.length - 1}
              mealFood={mealFood}
              onDecreaseGrams={() => onDecreaseGrams(meal.id, mealFood.id)}
              onIncreaseGrams={() => onIncreaseGrams(meal.id, mealFood.id)}
              onPress={() => onToggle(meal.id, mealFood.id)}
              onRemove={() => onRemoveFood(meal.id, mealFood.id)}
            />
          ))
        ) : (
          <Text style={styles.emptyMealText}>추가된 음식 없음</Text>
        )}
      </View>
    </Card>
  );
}

type FoodRowProps = {
  food: Food | undefined;
  isLast: boolean;
  mealFood: MealFood;
  onDecreaseGrams: () => void;
  onIncreaseGrams: () => void;
  onPress: () => void;
  onRemove: () => void;
};

function FoodRow({
  food,
  isLast,
  mealFood,
  onDecreaseGrams,
  onIncreaseGrams,
  onPress,
  onRemove,
}: FoodRowProps) {
  const consumedGrams = normalizeConsumedGrams(mealFood.consumedGrams);
  const totalNutrition = mealFood.calculatedNutrition;
  const missingPrimaryFields = primaryNutritionFields.filter(
    (field) => mealFood.calculatedNutrition[field] === null,
  );
  const foodName = food?.name ?? '알 수 없는 음식';
  const handleDecrease = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onDecreaseGrams();
  };
  const handleIncrease = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onIncreaseGrams();
  };
  const handleRemove = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onRemove();
  };

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: mealFood.checked }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.foodRow,
        isLast ? styles.foodRowLast : null,
        pressed ? styles.foodRowPressed : null,
      ]}
    >
      <View style={[styles.checkbox, mealFood.checked ? styles.checkboxChecked : null]}>
        {mealFood.checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
      </View>

      <View style={styles.foodContent}>
        <View style={styles.foodHeader}>
          <View style={styles.foodTitleBlock}>
            <View style={styles.foodNameRow}>
              <Text style={styles.foodName}>{foodName}</Text>
              <Text style={styles.foodGramsBadge}>{formatAmountLabel(consumedGrams)}g</Text>
            </View>
            <Text style={styles.foodMeta}>
              {food?.category ?? '분류 없음'} · 기준 {food ? formatServingText(food) : '정보 없음'}
            </Text>
          </View>
          <View style={styles.gramsControl}>
            <Pressable
              accessibilityLabel={`${foodName} 섭취량 10g 감소`}
              accessibilityRole="button"
              onPress={handleDecrease}
              style={({ pressed }) => [
                styles.gramsButton,
                pressed ? styles.gramsButtonPressed : null,
              ]}
            >
              <Text style={styles.gramsButtonText}>-10g</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={`${foodName} 섭취량 10g 증가`}
              accessibilityRole="button"
              onPress={handleIncrease}
              style={({ pressed }) => [
                styles.gramsButton,
                pressed ? styles.gramsButtonPressed : null,
              ]}
            >
              <Text style={styles.gramsButtonText}>+10g</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={`${foodName} 제거`}
              accessibilityRole="button"
              onPress={handleRemove}
              style={({ pressed }) => [
                styles.removeFoodButton,
                pressed ? styles.gramsButtonPressed : null,
              ]}
            >
              <Text style={styles.removeFoodButtonText}>삭제</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.foodNutritionLine}>
          {primaryNutritionFields.map((field) => (
            <Text key={field} style={styles.foodNutritionText}>
              {nutritionLabels[field]} {formatNutritionNumber(field, totalNutrition[field])}
              {totalNutrition[field] === null
                ? ''
                : ` ${nutritionUnits[field]}`}
            </Text>
          ))}
        </View>

        {missingPrimaryFields.length > 0 ? (
          <Text style={styles.foodWarning}>
            일부 영양정보 없음: {missingPrimaryFields.map((field) => nutritionLabels[field]).join(', ')}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
