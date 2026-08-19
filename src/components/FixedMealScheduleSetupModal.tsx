import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { hasValidGramServing } from '../meals';
import type { FixedMealWeekday, Food, MealType } from '../models';
import { calculateNutritionForConsumedGrams, formatNutritionValue } from '../nutrition';
import { styles } from '../styles';
import { formatAmountLabel } from '../utils/format';
import { getFoodDisplayName } from '../utils/foodDisplay';
import { FixedMealWeekdaySelector } from './FixedMealWeekdaySelector';
import { PrimaryButton, SecondaryButton } from './ui';

export type FixedMealScheduleSetupState = {
  consumedGrams: number;
  food: Food;
  mealType: MealType;
  weekdays: FixedMealWeekday[];
};

type FixedMealScheduleSetupModalProps = {
  onCancel: () => void;
  onChangeWeekdays: (weekdays: FixedMealWeekday[]) => void;
  onConfirm: () => void;
  state: FixedMealScheduleSetupState | null;
};

export function FixedMealScheduleSetupModal({
  onCancel,
  onChangeWeekdays,
  onConfirm,
  state,
}: FixedMealScheduleSetupModalProps) {
  if (state === null) {
    return null;
  }

  const foodName = getFoodDisplayName(state.food);
  const previewNutrition = hasValidGramServing(state.food)
    ? calculateNutritionForConsumedGrams(
        state.food.nutritionPerServing,
        state.consumedGrams,
        state.food.servingSize,
      )
    : null;
  const calorieText = previewNutrition === null
    ? '칼로리 정보 없음'
    : formatNutritionValue('caloriesKcal', previewNutrition.caloriesKcal);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      transparent
      visible
    >
      <View style={styles.modalOverlay} testID="fixed-meal-schedule-modal">
        <Pressable
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onPress={onCancel}
          style={styles.modalScrim}
        />
        <View
          accessibilityLabel={`${foodName} 고정 식단 설정 대화상자`}
          accessibilityViewIsModal
          aria-modal={true}
          importantForAccessibility="yes"
          role="dialog"
          style={styles.fixedMealScheduleSetupModal}
        >
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.fixedMealScheduleSetupHeader}>
              <Text style={styles.fixedMealScheduleSetupTitle}>고정 식단 설정</Text>
              <Text numberOfLines={1} style={styles.fixedMealScheduleSetupFoodName}>{foodName}</Text>
              <Text style={styles.fixedMealScheduleSetupMeta}>
                {formatAmountLabel(state.consumedGrams)}g · {calorieText}
              </Text>
            </View>

            <FixedMealWeekdaySelector
              onChangeWeekdays={onChangeWeekdays}
              testIDPrefix="add-schedule"
              title={foodName}
              weekdays={state.weekdays}
            />

            <View style={styles.fixedMealScheduleSetupActions}>
              <SecondaryButton
                accessibilityLabel="고정 식단 설정 취소"
                label="취소"
                onPress={onCancel}
                style={styles.fixedMealScheduleSetupButton}
              />
              <PrimaryButton
                accessibilityLabel="고정 식단 추가"
                disabled={state.weekdays.length === 0}
                label="고정 식단 추가"
                onPress={onConfirm}
                style={styles.fixedMealScheduleSetupButton}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
