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
import { NoticeBox, PrimaryButton, SecondaryButton } from './ui';

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
              <View>
                <Text style={styles.sectionTitle}>{mealLabels[mealType]} 음식 추가</Text>
                <Text style={styles.sectionSubtitle}>음식명을 검색한 뒤 섭취 g수를 입력합니다.</Text>
              </View>
              <SecondaryButton
                accessibilityLabel="닫기"
                label="닫기"
                onPress={onClose}
                style={styles.searchCloseButton}
                textStyle={styles.searchCloseButtonText}
              />
            </View>

            <View style={styles.searchInputRow}>
              <TextInput
                accessibilityLabel={`${mealLabels[mealType]} 음식명 입력`}
                autoFocus
                onChangeText={onQueryChange}
                placeholder={`${mealLabels[mealType]} 음식명 입력`}
                placeholderTextColor={colors.textSoft}
                returnKeyType="search"
                style={styles.searchInput}
                value={query}
              />
            </View>

            {isSearching ? <Text style={styles.searchMessageText}>검색 중</Text> : null}

            {searchError !== null ? (
              <NoticeBox message={searchError} title="검색 오류" variant="danger" />
            ) : null}

            {hasSearched && !isSearching && searchError === null && results.length === 0 ? (
              <NoticeBox message="검색 결과가 없습니다." title="결과 없음" />
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

  return (
    <View style={styles.searchResultCard}>
      <View style={styles.searchResultHeader}>
        <View style={styles.searchResultTitleBlock}>
          <Text style={styles.searchResultName}>{food.name}</Text>
          <Text style={styles.searchResultMeta}>
            {food.category ?? '분류 없음'} · 제공량 {formatServingText(food)}
          </Text>
        </View>
        {!canAddFood ? (
          <Text style={styles.resultWarning}>추가 불가</Text>
        ) : missingPrimaryFields.length > 0 ? (
          <Text style={styles.resultWarning}>일부 영양정보 없음</Text>
        ) : null}
      </View>

      {!canAddFood ? (
        <NoticeBox
          message="기준 g 제공량이 없어 섭취량 계산을 할 수 없습니다."
          title="추가 불가"
          variant="warning"
        />
      ) : null}

      <View style={styles.searchNutritionGrid}>
        {primaryNutritionFields.map((field) => (
          <View key={field} style={styles.searchNutritionItem}>
            <Text style={styles.searchNutritionLabel}>{nutritionLabels[field]}</Text>
            <Text style={styles.searchNutritionValue}>
              {formatNutritionValue(field, food.nutritionPerServing[field])}
            </Text>
          </View>
        ))}
      </View>

      <PrimaryButton
        accessibilityLabel={canAddFood ? `${food.name} 추가` : `${food.name} 추가 불가`}
        disabled={!canAddFood}
        label={canAddFood ? '추가' : '추가 불가'}
        onPress={() => onSelectFood(food)}
        style={styles.selectFoodButton}
        textStyle={styles.selectFoodButtonText}
      />
    </View>
  );
}
