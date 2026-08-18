import type { ReactNode } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { Pressable, Text, View } from 'react-native';

import { mealLabels } from '../constants';
import { isFixedMealFood } from '../fixedMeals';
import { normalizeConsumedGrams } from '../meals';
import type { Food, Meal, MealFood, MealSummary, MealType } from '../models';
import {
  formatNutritionNumber,
  nutritionLabels,
  nutritionUnits,
  primaryNutritionFields,
} from '../nutrition';
import { styles } from '../styles';
import {
  createMealSectionModel,
  formatCompactNutritionWithUnit,
  mealSectionActionLabels,
} from '../todayPresentation';
import { formatAmountLabel } from '../utils/format';
import { getDevelopmentSourceFoodName, getFoodDisplayName } from '../utils/foodDisplay';
import { EmptyState } from './ui';

type MealSectionProps = {
  foodsById: Record<string, Food>;
  meal: Meal;
  onCreateFixedMeal: (mealId: string, mealFoodId: string) => void;
  onDecreaseGrams: (mealId: string, mealFoodId: string) => void;
  onIncreaseGrams: (mealId: string, mealFoodId: string) => void;
  onOpenFixedMealManagement: (mealType: MealType) => void;
  onOpenSearch: (mealType: MealType) => void;
  onRemoveFood: (mealId: string, mealFoodId: string) => void;
  onToggle: (mealId: string, mealFoodId: string) => void;
  searchPanel: ReactNode;
  summary: MealSummary | null | undefined;
};

export function MealSection({
  foodsById,
  meal,
  onCreateFixedMeal,
  onDecreaseGrams,
  onIncreaseGrams,
  onOpenFixedMealManagement,
  onOpenSearch,
  onRemoveFood,
  onToggle,
  searchPanel,
  summary,
}: MealSectionProps) {
  const mealModel = createMealSectionModel(meal.foods.length, summary);

  return (
    <View style={styles.mealSection}>
      <View style={styles.mealHeader}>
        <View style={styles.mealTitleBlock}>
          <Text style={styles.mealTitle}>{mealLabels[meal.type]}</Text>
          <Text style={styles.mealStatus}>{mealModel.completionLabel}</Text>
        </View>
        <Text style={styles.mealKcalText}>{mealModel.calorieLabel}</Text>
      </View>

      {mealModel.hasMissingNutrition ? (
        <Text style={styles.mealInlineWarning}>일부 음식의 영양정보가 합산에서 제외됐습니다.</Text>
      ) : null}

      <View style={styles.foodList}>
        {meal.foods.length > 0 ? (
          meal.foods.map((mealFood, index) => (
            <FoodRow
              key={mealFood.id}
              food={foodsById[mealFood.foodId]}
              isLast={index === meal.foods.length - 1}
              mealFood={mealFood}
              onCreateFixedMeal={() => onCreateFixedMeal(meal.id, mealFood.id)}
              onDecreaseGrams={() => onDecreaseGrams(meal.id, mealFood.id)}
              onIncreaseGrams={() => onIncreaseGrams(meal.id, mealFood.id)}
              onPress={() => onToggle(meal.id, mealFood.id)}
              onRemove={() => onRemoveFood(meal.id, mealFood.id)}
            />
          ))
        ) : (
          <EmptyState
            icon="+"
            message="음식 추가 버튼으로 아침, 점심, 저녁 기록을 시작할 수 있습니다."
            title="추가된 음식 없음"
          />
        )}
      </View>

      <View style={styles.mealActionRow}>
        <Pressable
          accessibilityLabel={`${mealLabels[meal.type]} 음식 추가`}
          accessibilityRole="button"
          onPress={() => onOpenSearch(meal.type)}
          style={({ pressed }) => [
            styles.addFoodCompactButton,
            pressed ? styles.addFoodCompactButtonPressed : null,
          ]}
        >
          <Text style={styles.addFoodCompactIcon}>+</Text>
          <Text style={styles.addFoodCompactText}>{mealSectionActionLabels.addFood}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={`${mealLabels[meal.type]} 고정 식단 관리`}
          accessibilityRole="button"
          onPress={() => onOpenFixedMealManagement(meal.type)}
          style={({ pressed }) => [
            styles.fixedMealManageButton,
            pressed ? styles.addFoodCompactButtonPressed : null,
          ]}
        >
          <Text style={styles.fixedMealManageButtonText}>{mealSectionActionLabels.manageFixedMeals}</Text>
        </Pressable>
      </View>

      {searchPanel}
    </View>
  );
}

type FoodRowProps = {
  food: Food | undefined;
  isLast: boolean;
  mealFood: MealFood;
  onCreateFixedMeal: () => void;
  onDecreaseGrams: () => void;
  onIncreaseGrams: () => void;
  onPress: () => void;
  onRemove: () => void;
};

function FoodRow({
  food,
  isLast,
  mealFood,
  onCreateFixedMeal,
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
  const fixedMealFood = isFixedMealFood(mealFood);
  const foodName = food === undefined ? '알 수 없는 음식' : getFoodDisplayName(food);
  const sourceFoodName = food === undefined ? null : getDevelopmentSourceFoodName(food);
  const calories = formatCompactNutritionWithUnit('caloriesKcal', totalNutrition.caloriesKcal);
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
  const handleCreateFixedMeal = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onCreateFixedMeal();
  };

  return (
    <Pressable
      accessibilityLabel={`${foodName} ${mealFood.checked ? '체크됨' : '미체크'}`}
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
              {fixedMealFood ? (
                <Text style={styles.fixedMealBadge}>고정 식단</Text>
              ) : null}
            </View>
            <Text style={styles.foodMeta}>{formatAmountLabel(consumedGrams)}g</Text>
            {sourceFoodName !== null ? (
              <Text style={styles.foodSourceName}>{sourceFoodName}</Text>
            ) : null}
          </View>
          <Text style={styles.foodKcalText}>{calories}</Text>
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
          {fixedMealFood ? (
            <View style={[styles.pinFoodButton, styles.pinFoodButtonPinned]}>
              <Text style={[styles.pinFoodButtonText, styles.pinFoodButtonTextPinned]}>
                고정됨
              </Text>
            </View>
          ) : (
            <Pressable
              accessibilityLabel={`${foodName} 고정 식단 등록`}
              accessibilityRole="button"
              onPress={handleCreateFixedMeal}
              style={({ pressed }) => [
                styles.pinFoodButton,
                pressed ? styles.gramsButtonPressed : null,
              ]}
            >
              <Text style={styles.pinFoodButtonText}>고정</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityLabel={`${foodName} ${fixedMealFood ? '선택 날짜에서 제외' : '삭제'}`}
            accessibilityRole="button"
            onPress={handleRemove}
            style={({ pressed }) => [
              styles.removeFoodButton,
              pressed ? styles.gramsButtonPressed : null,
            ]}
          >
            <Text style={styles.removeFoodButtonText}>{fixedMealFood ? '제외' : '삭제'}</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}
