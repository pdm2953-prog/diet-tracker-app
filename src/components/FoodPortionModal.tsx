import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { colors } from '../constants';
import { hasValidGramServing } from '../meals';
import type { MealType } from '../models';
import {
  calculateNutritionForConsumedGrams,
  formatNutritionValue,
  nutritionLabels,
  primaryNutritionFields,
} from '../nutrition';
import type { FoodSearchResult } from '../services/foodSearch';
import { styles } from '../styles';
import { formatServingText, parseNumberInput } from '../utils/format';
import { getDevelopmentSourceFoodName, getFoodDisplayName } from '../utils/foodDisplay';
import { NoticeBox, PrimaryButton, SecondaryButton } from './ui';

export type FoodPortionModalState = {
  food: FoodSearchResult;
  mealType: MealType;
};

type FoodPortionModalProps = {
  gramsInput: string;
  onChangeGramsInput: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  state: FoodPortionModalState | null;
};

export function FoodPortionModal({
  gramsInput,
  onChangeGramsInput,
  onClose,
  onConfirm,
  state,
}: FoodPortionModalProps) {
  if (state === null) {
    return null;
  }

  const consumedGrams = parseNumberInput(gramsInput);
  const servingSize = hasValidGramServing(state.food)
    ? state.food.servingSize
    : null;
  const hasValidServing = servingSize !== null;
  const hasValidInput = Number.isFinite(consumedGrams) && consumedGrams > 0;
  const canConfirm = hasValidServing && hasValidInput;
  const portionErrorMessage = hasValidServing
    ? '섭취량은 0보다 큰 숫자로 입력해주세요.'
    : '기준 g 제공량이 없어 식단에 추가할 수 없습니다.';
  const previewNutrition = servingSize !== null && hasValidInput
    ? calculateNutritionForConsumedGrams(
        state.food.nutritionPerServing,
        consumedGrams,
        servingSize,
      )
    : null;
  const macroFields = primaryNutritionFields.filter((field) => field !== 'caloriesKcal');
  const foodDisplayName = getFoodDisplayName(state.food);
  const sourceFoodName = getDevelopmentSourceFoodName(state.food);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible
    >
      <View style={styles.modalOverlay}>
        <Pressable
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onPress={onClose}
          style={styles.modalScrim}
        />
        <View
          accessibilityLabel={`${foodDisplayName} 섭취량 입력 대화상자`}
          role="dialog"
          accessibilityViewIsModal
          aria-modal={true}
          importantForAccessibility="yes"
          style={styles.portionModal}
        >
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.portionHeader}>
              <Text style={styles.portionModalTitle}>섭취량 입력</Text>
              <Text style={styles.portionFoodName}>{foodDisplayName}</Text>
              {sourceFoodName !== null ? (
                <Text style={styles.portionSourceFoodName}>{sourceFoodName}</Text>
              ) : null}
              <Text style={styles.portionServingText}>
                기준 제공량 {formatServingText(state.food)}
              </Text>
            </View>

            <View style={styles.portionInputBlock}>
              <Text style={styles.portionInputLabel}>먹은 양</Text>
              <View style={styles.portionInputRow}>
                <TextInput
                  accessibilityLabel={`${foodDisplayName} 섭취 g 수 입력`}
                  autoFocus
                  keyboardType="decimal-pad"
                  onChangeText={onChangeGramsInput}
                  placeholder="50"
                  placeholderTextColor={colors.textSoft}
                  selectTextOnFocus
                  style={styles.portionInput}
                  value={gramsInput}
                />
                <Text style={styles.portionUnitText}>g</Text>
              </View>
              <Text style={styles.portionInputHelp}>입력한 g수 기준으로 식단 영양성분이 계산됩니다.</Text>
            </View>

            {previewNutrition !== null ? (
              <View style={styles.portionPreview}>
                <View style={styles.portionPreviewHero}>
                  <Text style={styles.portionPreviewHeroLabel}>예상 칼로리</Text>
                  <Text style={styles.portionPreviewHeroValue}>
                    {formatNutritionValue('caloriesKcal', previewNutrition.caloriesKcal)}
                  </Text>
                </View>
                <View style={styles.portionPreviewGrid}>
                  {macroFields.map((field) => (
                    <View key={field} style={styles.portionPreviewItem}>
                      <Text style={styles.portionPreviewLabel}>{nutritionLabels[field]}</Text>
                      <Text style={styles.portionPreviewValue}>
                        {formatNutritionValue(field, previewNutrition[field])}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <NoticeBox message={portionErrorMessage} title="입력 확인" variant="danger" />
            )}

            <View style={styles.portionButtonRow}>
              <SecondaryButton
                accessibilityLabel="섭취량 입력 취소"
                label="취소"
                onPress={onClose}
                style={styles.portionCancelButton}
                textStyle={styles.portionCancelButtonText}
              />
              <PrimaryButton
                accessibilityLabel="식단에 추가"
                disabled={!canConfirm}
                label="식단에 추가"
                onPress={onConfirm}
                style={styles.portionConfirmButton}
                textStyle={styles.portionConfirmButtonText}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
