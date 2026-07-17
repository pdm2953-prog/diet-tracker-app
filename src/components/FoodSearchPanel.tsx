import { Pressable, Text, TextInput, View } from 'react-native';

import { mealLabels } from '../constants';
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
    <View style={styles.searchPanel}>
      <View style={styles.searchHeader}>
        <Text style={styles.sectionTitle}>{mealLabels[mealType]} 음식 추가</Text>
        <Pressable
          accessibilityLabel="음식 검색 닫기"
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [
            styles.searchCloseButton,
            pressed ? styles.searchCloseButtonPressed : null,
          ]}
        >
          <Text style={styles.searchCloseButtonText}>닫기</Text>
        </Pressable>
      </View>

      <View style={styles.searchInputRow}>
        <TextInput
          accessibilityLabel={`${mealLabels[mealType]} 음식명 입력`}
          autoFocus
          onChangeText={onQueryChange}
          placeholder={`${mealLabels[mealType]} 음식명 입력`}
          placeholderTextColor="#8b9588"
          returnKeyType="search"
          style={styles.searchInput}
          value={query}
        />
      </View>

      {isSearching ? <Text style={styles.searchMessageText}>검색 중</Text> : null}

      {searchError !== null ? (
        <Text style={styles.searchErrorText}>{searchError}</Text>
      ) : null}

      {hasSearched && !isSearching && searchError === null && results.length === 0 ? (
        <Text style={styles.searchMessageText}>검색 결과 없음</Text>
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
    </View>
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

      <Pressable
        accessibilityLabel={canAddFood ? `${food.name} 추가` : `${food.name} 추가 불가`}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canAddFood }}
        disabled={!canAddFood}
        onPress={() => {
          if (canAddFood) {
            onSelectFood(food);
          }
        }}
        style={({ pressed }) => [
          styles.selectFoodButton,
          !canAddFood ? styles.selectFoodButtonDisabled : null,
          pressed && canAddFood ? styles.selectFoodButtonPressed : null,
        ]}
      >
        <Text
          style={[
            styles.selectFoodButtonText,
            !canAddFood ? styles.selectFoodButtonDisabledText : null,
          ]}
        >
          {canAddFood ? '추가' : '추가 불가'}
        </Text>
      </Pressable>
    </View>
  );
}
