import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { GestureResponderEvent } from 'react-native';
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { createMockTodayData } from './src/mockTodayData';
import {
  addFoodToMeals,
  hasValidGramServing,
  normalizeConsumedGrams,
} from './src/meals';
import {
  Food,
  Meal,
  MealFood,
  MealSummary,
  MealType,
  NutritionField,
} from './src/models';
import {
  buildDailySummary,
  dailyTargets,
  formatNutritionNumber,
  formatNutritionValue,
  calculateNutritionForConsumedGrams,
  nutritionLabels,
  nutritionUnits,
  primaryNutritionFields,
} from './src/nutrition';
import {
  FOOD_SEARCH_RESULT_LIMIT,
  mockFoodSearchProvider,
} from './src/services/foodSearch';
import type { FoodSearchResult } from './src/services/foodSearch';

const mealLabels: Record<MealType, string> = {
  breakfast: '아침',
  lunch: '점심',
  dinner: '저녁',
};

const GRAM_ADJUST_STEP = 10;

let mealFoodIdSequence = 0;

type PrimaryNutritionField = (typeof primaryNutritionFields)[number];

type PortionModalState = {
  food: FoodSearchResult;
  mealType: MealType;
};

function isPrimaryNutritionField(
  field: NutritionField,
): field is PrimaryNutritionField {
  return (primaryNutritionFields as readonly NutritionField[]).includes(field);
}

function createMealFoodId(foodId: string): string {
  mealFoodIdSequence += 1;

  return `meal-food-${foodId}-${Date.now()}-${mealFoodIdSequence}`;
}

function formatAmountLabel(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
}

function formatServingText(food: Food): string {
  if (!hasValidServingSize(food)) {
    return '제공량 정보 없음';
  }

  return `${formatAmountLabel(food.servingSize)} ${food.servingUnit}`;
}

function hasValidServingSize(
  food: Food,
): food is Food & { servingSize: number; servingUnit: string } {
  return food.servingSize !== null && Number.isFinite(food.servingSize) && food.servingSize > 0 && food.servingUnit !== null;
}


function getMissingPrimaryFields(
  nutrition: Food['nutritionPerServing'],
): PrimaryNutritionField[] {
  return primaryNutritionFields.filter((field) => nutrition[field] === null);
}


function parseConsumedGramsInput(input: string): number {
  const normalizedInput = input.trim().replace(',', '.');

  if (normalizedInput.length === 0) {
    return Number.NaN;
  }

  return Number(normalizedInput);
}

function getLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatDateLabel(date: string): string {
  const [year, month, day] = date.split('-');

  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

export default function App() {
  const today = useMemo(() => getLocalDateString(), []);
  const mockData = useMemo(() => createMockTodayData(today), [today]);
  const [foods, setFoods] = useState<Food[]>(() => mockData.foods);
  const [meals, setMeals] = useState<Meal[]>(() => mockData.meals);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FoodSearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeSearchMealType, setActiveSearchMealType] = useState<MealType | null>(null);
  const [portionModal, setPortionModal] = useState<PortionModalState | null>(null);
  const [portionGramsInput, setPortionGramsInput] = useState('');
  const foodsById = useMemo<Record<string, Food>>(
    () =>
      Object.fromEntries(
        foods.map((food) => [food.id, food]),
      ) as Record<string, Food>,
    [foods],
  );
  const dailySummary = useMemo(
    () => buildDailySummary(today, meals),
    [meals, today],
  );

  const toggleMealFood = (mealId: string, mealFoodId: string) => {
    const updatedAt = new Date().toISOString();

    setMeals((currentMeals) =>
      currentMeals.map((meal) => {
        if (meal.id !== mealId) {
          return meal;
        }

        return {
          ...meal,
          updatedAt,
          foods: meal.foods.map((mealFood) =>
            mealFood.id === mealFoodId
              ? { ...mealFood, checked: !mealFood.checked, updatedAt }
              : mealFood,
          ),
        };
      }),
    );
  };

  const resetFoodSearchState = () => {
    setSearchQuery('');
    setSearchResults([]);
    setHasSearched(false);
    setIsSearching(false);
    setSearchError(null);
  };

  const openFoodSearch = (mealType: MealType) => {
    setActiveSearchMealType(mealType);
    resetFoodSearchState();
  };

  const closeFoodSearch = () => {
    setActiveSearchMealType(null);
    resetFoodSearchState();
  };

  useEffect(() => {
    const query = searchQuery.trim();

    if (activeSearchMealType === null || query.length === 0) {
      setHasSearched(false);
      setIsSearching(false);
      setSearchError(null);
      setSearchResults([]);
      return;
    }

    let isCurrent = true;

    setHasSearched(true);
    setIsSearching(true);
    setSearchError(null);

    mockFoodSearchProvider
      .searchFoods(query, { limit: FOOD_SEARCH_RESULT_LIMIT })
      .then((results) => {
        if (isCurrent) {
          setSearchResults(results);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setSearchError('검색 중 오류가 발생했습니다.');
          setSearchResults([]);
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsSearching(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [activeSearchMealType, searchQuery]);

  const addFoodToMeal = (
    food: FoodSearchResult,
    mealType: MealType,
    consumedGrams: number,
  ) => {
    const normalizedConsumedGrams = normalizeConsumedGrams(consumedGrams);

    if (!hasValidGramServing(food) || normalizedConsumedGrams <= 0) {
      return;
    }

    const updatedAt = new Date().toISOString();

    setFoods((currentFoods) =>
      currentFoods.some((currentFood) => currentFood.id === food.id)
        ? currentFoods
        : [...currentFoods, food],
    );

    setMeals((currentMeals) =>
      addFoodToMeals(currentMeals, food, mealType, normalizedConsumedGrams, {
        createMealFoodId,
        updatedAt,
      }),
    );
  };

  const closePortionModal = () => {
    setPortionModal(null);
    setPortionGramsInput('');
  };

  const openPortionModal = (food: FoodSearchResult, mealType: MealType) => {
    if (!hasValidGramServing(food)) {
      return;
    }

    setPortionModal({ food, mealType });
    setPortionGramsInput(formatAmountLabel(food.servingSize));
  };

  const confirmPortionModal = () => {
    if (portionModal === null) {
      return;
    }

    const consumedGrams = parseConsumedGramsInput(portionGramsInput);

    if (!Number.isFinite(consumedGrams) || consumedGrams <= 0) {
      return;
    }

    addFoodToMeal(portionModal.food, portionModal.mealType, consumedGrams);
    closePortionModal();
  };

  const updateMealFoodConsumedGrams = (
    mealId: string,
    mealFoodId: string,
    deltaGrams: number,
  ) => {
    const updatedAt = new Date().toISOString();

    setMeals((currentMeals) =>
      currentMeals.map((meal) => {
        if (meal.id !== mealId) {
          return meal;
        }

        return {
          ...meal,
          updatedAt,
          foods: meal.foods.flatMap((mealFood) => {
            if (mealFood.id !== mealFoodId) {
              return [mealFood];
            }

            const nextConsumedGrams = normalizeConsumedGrams(mealFood.consumedGrams) + deltaGrams;

            if (nextConsumedGrams <= 0) {
              return [];
            }

            const food = foodsById[mealFood.foodId];
            const calculatedNutrition = food && hasValidGramServing(food)
              ? calculateNutritionForConsumedGrams(
                  food.nutritionPerServing,
                  nextConsumedGrams,
                  food.servingSize,
                )
              : mealFood.calculatedNutrition;

            return [
              {
                ...mealFood,
                consumedGrams: nextConsumedGrams,
                calculatedNutrition,
                updatedAt,
              },
            ];
          }),
        };
      }),
    );
  };

  const decreaseMealFoodGrams = (mealId: string, mealFoodId: string) => {
    updateMealFoodConsumedGrams(mealId, mealFoodId, -GRAM_ADJUST_STEP);
  };

  const increaseMealFoodGrams = (mealId: string, mealFoodId: string) => {
    updateMealFoodConsumedGrams(mealId, mealFoodId, GRAM_ADJUST_STEP);
  };

  const removeMealFood = (mealId: string, mealFoodId: string) => {
    const updatedAt = new Date().toISOString();

    setMeals((currentMeals) =>
      currentMeals.map((meal) => {
        if (meal.id !== mealId) {
          return meal;
        }

        return {
          ...meal,
          updatedAt,
          foods: meal.foods.filter((mealFood) => mealFood.id !== mealFoodId),
        };
      }),
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Today</Text>
          <Text style={styles.title}>오늘 식단</Text>
          <Text style={styles.dateText}>{formatDateLabel(today)}</Text>
        </View>

        <View style={styles.summaryPanel}>
          <View style={styles.summaryHeader}>
            <View>
              <Text style={styles.sectionTitle}>하루 섭취량</Text>
              <Text style={styles.sectionSubtitle}>체크한 음식만 합산</Text>
            </View>
            <Text style={styles.checkedCountText}>
              {dailySummary.checkedCount}개 체크
            </Text>
          </View>

          {dailySummary.missingNutritionFields.length > 0 ? (
            <MissingNutritionNotice
              missingFields={dailySummary.missingNutritionFields}
            />
          ) : null}

          <View style={styles.metricsStack}>
            {primaryNutritionFields.map((field) => (
              <ProgressMetric
                key={field}
                field={field}
                isMissing={dailySummary.missingNutritionFields.includes(field)}
                value={dailySummary.checkedNutritionTotal[field]}
              />
            ))}
          </View>
        </View>

        <View style={styles.mealStack}>
          {meals.map((meal) => (
            <MealSection
              key={meal.id}
              foodsById={foodsById}
              meal={meal}
              onDecreaseGrams={decreaseMealFoodGrams}
              onIncreaseGrams={increaseMealFoodGrams}
              onRemoveFood={removeMealFood}
              onOpenSearch={openFoodSearch}
              onToggle={toggleMealFood}
              searchPanel={
                activeSearchMealType === meal.type ? (
                  <FoodSearchPanel
                    hasSearched={hasSearched}
                    isSearching={isSearching}
                    mealType={meal.type}
                    onClose={closeFoodSearch}
                    onQueryChange={setSearchQuery}
                    onSelectFood={(food) => openPortionModal(food, meal.type)}
                    query={searchQuery}
                    results={searchResults}
                    searchError={searchError}
                  />
                ) : null
              }
              summary={dailySummary.mealSummaries.find(
                (mealSummary) => mealSummary.mealId === meal.id,
              )}
            />
          ))}
        </View>

        <Text style={styles.disclaimer}>
          영양정보는 참고용입니다. 섭취량 계산은 입력값과 데이터 출처에 따라 달라질 수 있습니다.
        </Text>
      </ScrollView>

      <FoodPortionModal
        gramsInput={portionGramsInput}
        onChangeGramsInput={setPortionGramsInput}
        onClose={closePortionModal}
        onConfirm={confirmPortionModal}
        state={portionModal}
      />
    </SafeAreaView>
  );
}

type FoodPortionModalProps = {
  gramsInput: string;
  onChangeGramsInput: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  state: PortionModalState | null;
};

function FoodPortionModal({
  gramsInput,
  onChangeGramsInput,
  onClose,
  onConfirm,
  state,
}: FoodPortionModalProps) {
  if (state === null) {
    return null;
  }

  const consumedGrams = parseConsumedGramsInput(gramsInput);
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
          accessibilityLabel="섭취량 입력 닫기"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.modalScrim}
        />
        <View style={styles.portionModal}>
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
              placeholderTextColor="#8b9588"
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
            <Text style={styles.portionErrorText}>{portionErrorMessage}</Text>
          )}

          <View style={styles.portionButtonRow}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [
                styles.portionCancelButton,
                pressed ? styles.portionButtonPressed : null,
              ]}
            >
              <Text style={styles.portionCancelButtonText}>취소</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canConfirm }}
              disabled={!canConfirm}
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.portionConfirmButton,
                !canConfirm ? styles.portionConfirmButtonDisabled : null,
                pressed && canConfirm ? styles.portionButtonPressed : null,
              ]}
            >
              <Text
                style={[
                  styles.portionConfirmButtonText,
                  !canConfirm ? styles.portionConfirmButtonDisabledText : null,
                ]}
              >
                확인
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

type MissingNutritionNoticeProps = {
  missingFields: NutritionField[];
};

function MissingNutritionNotice({ missingFields }: MissingNutritionNoticeProps) {
  const missingFieldNames = missingFields
    .filter(isPrimaryNutritionField)
    .map((field) => nutritionLabels[field]);

  if (missingFieldNames.length === 0) {
    return null;
  }

  return (
    <View style={styles.warningPanel}>
      <Text style={styles.warningTitle}>일부 영양정보 없음</Text>
      <Text style={styles.warningBody}>
        {missingFieldNames.join(', ')} 값이 없는 음식은 해당 항목 합산에서 제외했습니다.
      </Text>
    </View>
  );
}

type ProgressMetricProps = {
  field: PrimaryNutritionField;
  isMissing: boolean;
  value: number | null;
};

function ProgressMetric({ field, isMissing, value }: ProgressMetricProps) {
  const target = dailyTargets[field] ?? 1;
  const progressRatio = value === null ? 0 : Math.min(value / target, 1);
  const progressWidth = `${Math.round(progressRatio * 100)}%` as `${number}%`;
  const valueLabel = formatNutritionValue(field, value);
  const targetLabel = formatNutritionValue(field, target);
  const progressLabel =
    value === null ? '0%' : `${Math.round((value / target) * 100)}%`;

  return (
    <View style={styles.metricBlock}>
      <View style={styles.metricTopRow}>
        <Text style={styles.metricName}>{nutritionLabels[field]}</Text>
        <Text style={styles.metricValue}>{valueLabel}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: progressWidth }]} />
      </View>
      <View style={styles.metricMetaRow}>
        <Text style={styles.metricMetaText}>
          목표 {targetLabel} 중 {progressLabel}
        </Text>
        {isMissing ? (
          <Text style={styles.metricWarningText}>일부 음식 정보 없음</Text>
        ) : null}
      </View>
    </View>
  );
}

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

function FoodSearchPanel({
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

function MealSection({
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
    <View style={styles.mealSection}>
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
    </View>
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
          <Text style={styles.foodName}>
            {foodName} {formatAmountLabel(consumedGrams)}g
          </Text>
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
        <Text style={styles.foodMeta}>
          {food?.category ?? '분류 없음'} · 기준 {food ? formatServingText(food) : '정보 없음'}
        </Text>

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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f5f7f3',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 18,
  },
  header: {
    gap: 4,
  },
  eyebrow: {
    color: '#57705a',
    fontSize: 13,
    fontWeight: '700',
  },
  title: {
    color: '#172016',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0,
  },
  dateText: {
    color: '#687265',
    fontSize: 15,
  },
  summaryPanel: {
    marginTop: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dde6d8',
    backgroundColor: '#ffffff',
    padding: 18,
    shadowColor: '#1b2819',
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    color: '#172016',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0,
  },
  sectionSubtitle: {
    color: '#687265',
    fontSize: 13,
    marginTop: 3,
  },
  checkedCountText: {
    backgroundColor: '#eaf3e5',
    borderRadius: 999,
    color: '#2f6d35',
    fontSize: 13,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  warningPanel: {
    backgroundColor: '#fff8e6',
    borderColor: '#f0bf4c',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
  },
  warningTitle: {
    color: '#7a4a00',
    fontSize: 14,
    fontWeight: '800',
  },
  warningBody: {
    color: '#7a4a00',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  metricsStack: {
    gap: 16,
    marginTop: 18,
  },
  metricBlock: {
    gap: 8,
  },
  metricTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  metricName: {
    color: '#283326',
    fontSize: 15,
    fontWeight: '700',
  },
  metricValue: {
    color: '#172016',
    fontSize: 15,
    fontWeight: '800',
  },
  progressTrack: {
    backgroundColor: '#e8ece4',
    borderRadius: 4,
    height: 8,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: '#2f7d32',
    borderRadius: 4,
    height: '100%',
  },
  metricMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  metricMetaText: {
    color: '#687265',
    fontSize: 12,
  },
  metricWarningText: {
    color: '#9a5b00',
    fontSize: 12,
    fontWeight: '700',
  },
  searchPanel: {
    borderTopColor: '#e5ebe1',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 14,
    paddingTop: 14,
  },
  searchHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  searchInputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  searchInput: {
    backgroundColor: '#fbfcfa',
    borderColor: '#cfdac9',
    borderRadius: 8,
    borderWidth: 1,
    color: '#172016',
    flex: 1,
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchMessageText: {
    color: '#687265',
    fontSize: 13,
    marginTop: 12,
  },
  searchErrorText: {
    color: '#9a2e00',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
  },
  searchResultList: {
    gap: 10,
    marginTop: 12,
  },
  searchResultCard: {
    backgroundColor: '#fbfcfa',
    borderColor: '#e1e8dd',
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  searchResultHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  searchResultTitleBlock: {
    flex: 1,
    gap: 4,
  },
  searchResultName: {
    color: '#172016',
    fontSize: 16,
    fontWeight: '800',
  },
  searchResultMeta: {
    color: '#687265',
    fontSize: 12,
  },
  resultWarning: {
    color: '#9a5b00',
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  searchNutritionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  searchNutritionItem: {
    backgroundColor: '#f1f5ef',
    borderRadius: 8,
    minWidth: 92,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchNutritionLabel: {
    color: '#687265',
    fontSize: 11,
    fontWeight: '700',
  },
  searchNutritionValue: {
    color: '#263324',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 3,
  },
  mealStack: {
    gap: 14,
    marginTop: 16,
  },
  mealSection: {
    backgroundColor: '#ffffff',
    borderColor: '#dde6d8',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  mealHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  mealTitle: {
    color: '#172016',
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 0,
  },
  mealStatus: {
    color: '#687265',
    fontSize: 13,
    marginTop: 3,
  },
  mealWarning: {
    color: '#9a5b00',
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  mealSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  mealSummaryText: {
    backgroundColor: '#f1f5ef',
    borderRadius: 999,
    color: '#40503d',
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  foodList: {
    borderTopColor: '#e5ebe1',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
  },
  foodRow: {
    alignItems: 'flex-start',
    borderBottomColor: '#e5ebe1',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
  },
  foodRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  foodRowPressed: {
    opacity: 0.72,
  },
  emptyMealText: {
    color: '#687265',
    fontSize: 13,
    paddingTop: 12,
  },
  checkbox: {
    alignItems: 'center',
    borderColor: '#8b9887',
    borderRadius: 6,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    marginTop: 2,
    width: 24,
  },
  checkboxChecked: {
    backgroundColor: '#2f7d32',
    borderColor: '#2f7d32',
  },
  checkboxMark: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 17,
  },
  foodContent: {
    flex: 1,
    gap: 6,
  },
  foodHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  foodName: {
    color: '#172016',
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  foodMeta: {
    color: '#687265',
    fontSize: 12,
  },
  foodNutritionLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  foodNutritionText: {
    color: '#40503d',
    fontSize: 12,
    lineHeight: 17,
  },
  foodWarning: {
    color: '#9a5b00',
    fontSize: 12,
    fontWeight: '700',
  },
  searchCloseButton: {
    alignItems: 'center',
    backgroundColor: '#eef3ec',
    borderColor: '#d7e1d2',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 10,
  },
  searchCloseButtonPressed: {
    opacity: 0.72,
  },
  searchCloseButtonText: {
    color: '#536250',
    fontSize: 12,
    fontWeight: '800',
  },
  selectFoodButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: '#2f7d32',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 36,
    minWidth: 62,
    paddingHorizontal: 12,
  },
  selectFoodButtonPressed: {
    opacity: 0.72,
  },
  selectFoodButtonDisabled: {
    backgroundColor: '#d8ded5',
  },
  selectFoodButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  selectFoodButtonDisabledText: {
    color: '#687265',
  },
  mealTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  openSearchButton: {
    alignItems: 'center',
    backgroundColor: '#2f7d32',
    borderRadius: 8,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  openSearchButtonPressed: {
    opacity: 0.72,
  },
  openSearchButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 22,
  },
  gramsControl: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
  },
  gramsButton: {
    alignItems: 'center',
    backgroundColor: '#eef3ec',
    borderColor: '#cbdcc4',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 30,
    minWidth: 48,
    paddingHorizontal: 8,
  },
  gramsButtonPressed: {
    opacity: 0.72,
  },
  gramsButtonText: {
    color: '#2f6d35',
    fontSize: 12,
    fontWeight: '900',
  },
  removeFoodButton: {
    alignItems: 'center',
    backgroundColor: '#fff2ed',
    borderColor: '#f2c2b4',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 30,
    minWidth: 42,
    paddingHorizontal: 8,
  },
  removeFoodButtonText: {
    color: '#9a2e00',
    fontSize: 12,
    fontWeight: '900',
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 32, 22, 0.34)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  modalScrim: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  portionModal: {
    backgroundColor: '#ffffff',
    borderColor: '#dde6d8',
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 360,
    padding: 18,
    width: '100%',
  },
  portionModalTitle: {
    color: '#172016',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0,
  },
  portionFoodName: {
    color: '#263324',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 8,
  },
  portionServingText: {
    color: '#687265',
    fontSize: 12,
    marginTop: 4,
  },
  portionInputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  portionInput: {
    backgroundColor: '#fbfcfa',
    borderColor: '#cfdac9',
    borderRadius: 8,
    borderWidth: 1,
    color: '#172016',
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  portionUnitText: {
    color: '#40503d',
    fontSize: 16,
    fontWeight: '800',
  },
  portionErrorText: {
    color: '#9a2e00',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
  },
  portionPreview: {
    borderTopColor: '#e5ebe1',
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
  },
  portionPreviewTitle: {
    color: '#263324',
    fontSize: 13,
    fontWeight: '800',
  },
  portionPreviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  portionPreviewItem: {
    flexGrow: 1,
    minWidth: 120,
  },
  portionPreviewLabel: {
    color: '#687265',
    fontSize: 11,
    fontWeight: '700',
  },
  portionPreviewValue: {
    color: '#172016',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  portionButtonRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
    marginTop: 18,
  },
  portionCancelButton: {
    alignItems: 'center',
    backgroundColor: '#eef3ec',
    borderColor: '#d7e1d2',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 66,
    paddingHorizontal: 12,
  },
  portionCancelButtonText: {
    color: '#536250',
    fontSize: 13,
    fontWeight: '800',
  },
  portionConfirmButton: {
    alignItems: 'center',
    backgroundColor: '#2f7d32',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 66,
    paddingHorizontal: 12,
  },
  portionConfirmButtonDisabled: {
    backgroundColor: '#d8ded5',
  },
  portionConfirmButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  portionConfirmButtonDisabledText: {
    color: '#687265',
  },
  portionButtonPressed: {
    opacity: 0.72,
  },
  disclaimer: {
    color: '#687265',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 18,
  },
});
