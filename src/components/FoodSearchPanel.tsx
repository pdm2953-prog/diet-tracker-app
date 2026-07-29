import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { colors, mealLabels } from '../constants';
import { hasValidGramServing } from '../meals';
import type { MealType } from '../models';
import {
  formatNutritionValue,
  nutritionLabels,
  primaryNutritionFields,
} from '../nutrition';
import type { FoodSearchResult } from '../services/foodSearch';
import { styles } from '../styles';
import { formatServingText } from '../utils/format';
import { getMissingPrimaryFields } from '../utils/nutritionUi';
import { EmptyState, NoticeBox, PrimaryButton, SecondaryButton, StatusBadge } from './ui';

type FoodSearchPanelProps = {
  hasSearched: boolean;
  isSearching: boolean;
  mealType: MealType;
  onClose: () => void;
  onQueryChange: (query: string) => void;
  onSelectFood: (food: FoodSearchResult) => void;
  query: string;
  results: FoodSearchResult[];
  searchError: string | null;
};

export function FoodSearchPanel({
  hasSearched,
  isSearching,
  mealType,
  onClose,
  onQueryChange,
  onSelectFood,
  query,
  results,
  searchError,
}: FoodSearchPanelProps) {
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
          accessibilityLabel={`${mealLabels[mealType]} 음식 검색 대화상자`}
          accessibilityViewIsModal
          aria-modal={true}
          role="dialog"
          importantForAccessibility="yes"
          style={styles.searchPanel}
        >
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.searchHeader}>
              <View style={styles.searchHeaderTextBlock}>
                <Text style={styles.sectionEyebrow}>{mealLabels[mealType]}</Text>
                <Text style={styles.sectionTitle}>음식 검색</Text>
                <Text style={styles.sectionSubtitle}>검색 후 섭취 g수를 입력해 식단에 추가합니다.</Text>
              </View>
              <SecondaryButton
                accessibilityLabel="음식 검색 닫기"
                label="닫기"
                onPress={onClose}
                style={styles.searchCloseButton}
                textStyle={styles.searchCloseButtonText}
              />
            </View>

            <View style={styles.searchInputRow}>
              <View style={styles.searchInputBlock}>
                <Text style={styles.searchInputLabel}>음식명</Text>
                <TextInput
                  accessibilityLabel={`${mealLabels[mealType]} 음식명 입력`}
                  autoFocus
                  onChangeText={onQueryChange}
                  placeholder="예: 닭가슴살, 현미밥"
                  placeholderTextColor={colors.textSoft}
                  returnKeyType="search"
                  style={styles.searchInput}
                  value={query}
                />
              </View>
            </View>

            {isSearching ? (
              <NoticeBox
                message="음식 영양정보를 불러오는 중입니다."
                title="검색 중"
              />
            ) : null}

            {searchError !== null ? (
              <NoticeBox message={searchError} title="검색 오류" variant="danger" />
            ) : null}

            {hasSearched && !isSearching && searchError === null && results.length === 0 ? (
              <EmptyState
                icon="-"
                message="다른 음식명이나 더 짧은 검색어로 다시 검색해보세요."
                title="검색 결과 없음"
              />
            ) : null}

            {results.length > 0 ? (
              <View style={styles.searchResultList}>
                {results.map((food) => (
                  <FoodSearchResultCard
                    key={food.id}
                    food={food}
                    onSelectFood={onSelectFood}
                  />
                ))}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

type FoodSearchResultCardProps = {
  food: FoodSearchResult;
  onSelectFood: (food: FoodSearchResult) => void;
};

function FoodSearchResultCard({ food, onSelectFood }: FoodSearchResultCardProps) {
  const missingPrimaryFields = getMissingPrimaryFields(food.nutritionPerServing);
  const canAddFood = hasValidGramServing(food);
  const macroFields = primaryNutritionFields.filter((field) => field !== 'caloriesKcal');

  return (
    <View style={styles.searchResultCard}>
      <View style={styles.searchResultHeader}>
        <View style={styles.searchResultTitleBlock}>
          <View style={styles.searchResultStatusRow}>
            <Text style={styles.searchResultName}>{food.name}</Text>
            {!canAddFood ? (
              <StatusBadge label="추가 불가" tone="warning" />
            ) : missingPrimaryFields.length > 0 ? (
              <StatusBadge label="일부 정보 없음" tone="warning" />
            ) : null}
          </View>
          <View style={styles.searchResultMetaRow}>
            <Text style={styles.searchResultMetaPill}>{food.category ?? '분류 없음'}</Text>
            <Text style={styles.searchResultMetaPill}>기준 {formatServingText(food)}</Text>
          </View>
        </View>
        <View style={styles.searchResultCalorieBlock}>
          <Text style={styles.searchResultCalorieLabel}>칼로리</Text>
          <Text style={styles.searchResultCalorieValue}>
            {formatNutritionValue('caloriesKcal', food.nutritionPerServing.caloriesKcal)}
          </Text>
        </View>
      </View>

      {!canAddFood ? (
        <NoticeBox
          message="기준 g 제공량이 없어 섭취량 계산을 할 수 없습니다."
          title="추가 불가"
          variant="warning"
        />
      ) : null}

      <View style={styles.searchNutritionGrid}>
        {macroFields.map((field) => (
          <View key={field} style={styles.searchNutritionItem}>
            <Text style={styles.searchNutritionLabel}>{nutritionLabels[field]}</Text>
            <Text style={styles.searchNutritionValue}>
              {formatNutritionValue(field, food.nutritionPerServing[field])}
            </Text>
          </View>
        ))}
      </View>

      <PrimaryButton
        accessibilityLabel={canAddFood ? `${food.name} 섭취량 입력` : `${food.name} 추가 불가`}
        disabled={!canAddFood}
        label={canAddFood ? '섭취량 입력' : '추가 불가'}
        onPress={() => onSelectFood(food)}
        style={styles.selectFoodButton}
        textStyle={styles.selectFoodButtonText}
      />
    </View>
  );
}
