import { Modal, Pressable, Text, TextInput, View } from 'react-native';

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
    ? '0보다 큰 숫자를 입력해주세요.'
    : '기준 g 제공량이 없어 추가할 수 없습니다.';
  const previewNutrition = servingSize !== null && hasValidInput
    ? calculateNutritionForConsumedGrams(
        state.food.nutritionPerServing,
        consumedGrams,
        servingSize,
      )
    : null;

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
          accessibilityLabel={`${state.food.name} 섭취량 입력 대화상자`}
          role="dialog"
          accessibilityViewIsModal
          aria-modal={true}
          importantForAccessibility="yes"
          style={styles.portionModal}
        >
          <Text style={styles.portionModalTitle}>얼마나 드셨나요?</Text>
          <Text style={styles.portionFoodName}>{state.food.name}</Text>
          <Text style={styles.portionServingText}>
            기준 {formatServingText(state.food)}
          </Text>

          <View style={styles.portionInputRow}>
            <TextInput
              accessibilityLabel={`${state.food.name} 섭취 g 수 입력`}
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

          {previewNutrition !== null ? (
            <View style={styles.portionPreview}>
              <Text style={styles.portionPreviewTitle}>예상 영양성분</Text>
              <View style={styles.portionPreviewGrid}>
                {primaryNutritionFields.map((field) => (
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
              label="취소"
              onPress={onClose}
              style={styles.portionCancelButton}
              textStyle={styles.portionCancelButtonText}
            />
            <PrimaryButton
              disabled={!canConfirm}
              label="확인"
              onPress={onConfirm}
              style={styles.portionConfirmButton}
              textStyle={styles.portionConfirmButtonText}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
