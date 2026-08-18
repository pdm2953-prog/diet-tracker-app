import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { FoodPortionModal } from '../components/FoodPortionModal';
import type { FoodPortionModalState } from '../components/FoodPortionModal';
import { FoodSearchPanel } from '../components/FoodSearchPanel';
import { MealSection } from '../components/MealSection';
import { NutritionSummaryPanel } from '../components/NutritionSummaryPanel';
import { GRAM_ADJUST_STEP } from '../constants';
import { isFixedMealFood } from '../fixedMeals';
import {
  addFoodToMeals,
  hasValidGramServing,
  normalizeConsumedGrams,
} from '../meals';
import {
  evaluateDailyMeal,
  mealEvaluationStatusLabels,
} from '../mealEvaluation';
import type { MealEvaluationResult } from '../mealEvaluation';
import type { Food, FoodSearchQueryMetadata, Meal, MealFood, MealType } from '../models';
import {
  buildDailySummary,
  calculateNutritionForConsumedGrams,
} from '../nutrition';
import type { DailyNutritionTargets } from '../nutrition';
import {
  defaultFoodSearchProvider,
  getDefaultFoodSearchResultLimit,
  isValidFoodSearchQuery,
} from '../services/foodSearch';
import type { FoodSearchResult } from '../services/foodSearch';
import {
  createFoodSearchRequestGate,
  scheduleFoodSearchRequest,
} from '../services/foodSearchRequest';
import { styles } from '../styles';
import { shouldEvaluateMealDate } from '../mealDatePolicy';
import {
  formatAmountLabel,
  formatDateLabel,
  getLocalDateString,
  parseNumberInput,
  shiftLocalDateString,
} from '../utils/format';

let mealFoodIdSequence = 0;

type TodayScreenProps = {
  foods: Food[];
  onCreateFixedMealTemplate: (mealType: MealType, mealFood: MealFood, food: Food) => void;
  onFoodsChange: Dispatch<SetStateAction<Food[]>>;
  onHideFixedMealSourceKey: (date: string, sourceKey: string) => void;
  onSelectedDateChange: (date: string) => void;
  onUpdateSelectedDateMeals: (
    updatedAt: string,
    updateMeals: (currentMeals: Meal[]) => Meal[],
  ) => void;
  selectedDate: string;
  selectedMeals: Meal[];
  targets: DailyNutritionTargets;
};

function createMealFoodId(foodId: string): string {
  mealFoodIdSequence += 1;

  return `meal-food-${foodId}-${Date.now()}-${mealFoodIdSequence}`;
}

export function TodayScreen({
  foods,
  onCreateFixedMealTemplate,
  onFoodsChange,
  onHideFixedMealSourceKey,
  onSelectedDateChange,
  onUpdateSelectedDateMeals,
  selectedDate,
  selectedMeals,
  targets,
}: TodayScreenProps) {
  const currentToday = getLocalDateString();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FoodSearchResult[]>([]);
  const [searchQueryMetadata, setSearchQueryMetadata] = useState<FoodSearchQueryMetadata | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeSearchMealType, setActiveSearchMealType] = useState<MealType | null>(null);
  const [portionModal, setPortionModal] = useState<FoodPortionModalState | null>(null);
  const [portionGramsInput, setPortionGramsInput] = useState('');
  const foodSearchRequestGate = useRef(createFoodSearchRequestGate()).current;
  const foodsById = useMemo<Record<string, Food>>(
    () =>
      Object.fromEntries(
        foods.map((food) => [food.id, food]),
      ) as Record<string, Food>,
    [foods],
  );
  const dailySummary = useMemo(
    () => buildDailySummary(selectedDate, selectedMeals),
    [selectedDate, selectedMeals],
  );
  const shouldEvaluateSelectedDate = shouldEvaluateMealDate(selectedDate, currentToday);
  const mealEvaluation = useMemo(
    () => shouldEvaluateSelectedDate ? evaluateDailyMeal(dailySummary, targets) : null,
    [dailySummary, shouldEvaluateSelectedDate, targets],
  );

  const updateSelectedDateMeals = (
    updatedAt: string,
    updateMeals: (currentMeals: Meal[]) => Meal[],
  ) => {
    onUpdateSelectedDateMeals(updatedAt, updateMeals);
  };

  const toggleMealFood = (mealId: string, mealFoodId: string) => {
    const updatedAt = new Date().toISOString();

    updateSelectedDateMeals(updatedAt, (currentMeals) =>
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
    setSearchQueryMetadata(null);
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

  const closePortionModal = () => {
    setPortionModal(null);
    setPortionGramsInput('');
  };

  const changeSelectedDate = (dayDelta: number) => {
    closeFoodSearch();
    closePortionModal();
    onSelectedDateChange(shiftLocalDateString(selectedDate, dayDelta));
  };

  const returnToToday = () => {
    closeFoodSearch();
    closePortionModal();
    onSelectedDateChange(getLocalDateString());
  };

  useEffect(() => {
    const query = searchQuery.trim();

    if (activeSearchMealType === null || !isValidFoodSearchQuery(query)) {
      foodSearchRequestGate.cancel();
      setHasSearched(false);
      setIsSearching(false);
      setSearchError(null);
      setSearchResults([]);
      setSearchQueryMetadata(null);
      return;
    }

    return scheduleFoodSearchRequest({
      callbacks: {
        onStart: () => {
          setHasSearched(true);
          setIsSearching(true);
          setSearchError(null);
          setSearchResults([]);
          setSearchQueryMetadata(null);
        },
        onSuccess: (results, queryMetadata) => {
          setSearchResults(results);
          setSearchQueryMetadata(queryMetadata ?? null);
        },
        onError: (message) => {
          setSearchError(message);
          setSearchResults([]);
          setSearchQueryMetadata(null);
        },
        onFinish: () => {
          setIsSearching(false);
        },
      },
      gate: foodSearchRequestGate,
      options: { limit: getDefaultFoodSearchResultLimit() },
      provider: defaultFoodSearchProvider,
      query,
    });
  }, [activeSearchMealType, foodSearchRequestGate, searchQuery]);

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

    onFoodsChange((currentFoods) =>
      currentFoods.some((currentFood) => currentFood.id === food.id)
        ? currentFoods
        : [...currentFoods, food],
    );

    updateSelectedDateMeals(updatedAt, (currentMeals) =>
      addFoodToMeals(currentMeals, food, mealType, normalizedConsumedGrams, {
        createMealFoodId,
        updatedAt,
      }),
    );
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

    const consumedGrams = parseNumberInput(portionGramsInput);

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

    updateSelectedDateMeals(updatedAt, (currentMeals) =>
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
    const mealFood = selectedMeals
      .find((meal) => meal.id === mealId)
      ?.foods.find((foodItem) => foodItem.id === mealFoodId);

    if (mealFood?.sourceKey) {
      onHideFixedMealSourceKey(selectedDate, mealFood.sourceKey);
    }

    updateSelectedDateMeals(updatedAt, (currentMeals) =>
      currentMeals.map((meal) => {
        if (meal.id !== mealId) {
          return meal;
        }

        return {
          ...meal,
          updatedAt,
          foods: meal.foods.filter((foodItem) => foodItem.id !== mealFoodId),
        };
      }),
    );
  };

  const createFixedMealFromMealFood = (mealId: string, mealFoodId: string) => {
    const meal = selectedMeals.find((currentMeal) => currentMeal.id === mealId);
    const mealFood = meal?.foods.find((foodItem) => foodItem.id === mealFoodId);

    if (meal === undefined || mealFood === undefined || isFixedMealFood(mealFood)) {
      return;
    }

    const food = foodsById[mealFood.foodId];

    if (food === undefined) {
      return;
    }

    onCreateFixedMealTemplate(meal.type, mealFood, food);
  };

  const selectedDateIsToday = selectedDate === currentToday;
  const foodSearchIsVisible = portionModal === null;

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.todayHeader}>
          <View style={styles.todayHeaderTextBlock}>
            <Text style={styles.todayScreenTitle}>Today</Text>
            <Text style={styles.todayDateText}>{formatDateLabel(selectedDate)}</Text>
          </View>
          <View style={styles.todayDateNav}>
            <Pressable
              accessibilityLabel="이전 날짜로 이동"
              accessibilityRole="button"
              onPress={() => changeSelectedDate(-1)}
              style={({ pressed }) => [
                styles.dateNavButton,
                pressed ? styles.dateNavButtonPressed : null,
              ]}
            >
              <Text style={styles.dateNavButtonText}>‹</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={selectedDateIsToday ? '오늘 날짜 선택됨' : '오늘 날짜로 이동'}
              accessibilityRole="button"
              onPress={returnToToday}
              style={({ pressed }) => [
                styles.dateNavTodayButton,
                selectedDateIsToday ? styles.dateNavTodayButtonActive : null,
                pressed ? styles.dateNavButtonPressed : null,
              ]}
            >
              <Text
                style={[
                  styles.dateNavTodayButtonText,
                  selectedDateIsToday ? styles.dateNavTodayButtonTextActive : null,
                ]}
              >
                오늘
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="다음 날짜로 이동"
              accessibilityRole="button"
              onPress={() => changeSelectedDate(1)}
              style={({ pressed }) => [
                styles.dateNavButton,
                pressed ? styles.dateNavButtonPressed : null,
              ]}
            >
              <Text style={styles.dateNavButtonText}>›</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.todayTopStack}>
          <NutritionSummaryPanel summary={dailySummary} targets={targets} />
          {mealEvaluation === null ? (
            <ScheduledMealNoticePanel />
          ) : (
            <MealEvaluationPanel evaluation={mealEvaluation} />
          )}
        </View>

        <View style={styles.mealStack}>
          {selectedMeals.map((meal) => (
            <MealSection
              key={meal.id}
              foodsById={foodsById}
              meal={meal}
              onCreateFixedMeal={createFixedMealFromMealFood}
              onDecreaseGrams={decreaseMealFoodGrams}
              onIncreaseGrams={increaseMealFoodGrams}
              onRemoveFood={removeMealFood}
              onOpenSearch={openFoodSearch}
              onToggle={toggleMealFood}
              searchPanel={
                foodSearchIsVisible && activeSearchMealType === meal.type ? (
                  <FoodSearchPanel
                    hasSearched={hasSearched}
                    isSearching={isSearching}
                    mealType={meal.type}
                    onClose={closeFoodSearch}
                    onQueryChange={setSearchQuery}
                    onSelectFood={(food) => openPortionModal(food, meal.type)}
                    query={searchQuery}
                    queryMetadata={searchQueryMetadata}
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
      </ScrollView>

      <FoodPortionModal
        gramsInput={portionGramsInput}
        onChangeGramsInput={setPortionGramsInput}
        onClose={closePortionModal}
        onConfirm={confirmPortionModal}
        state={portionModal}
      />
    </>
  );
}

function ScheduledMealNoticePanel() {
  return (
    <View style={styles.inlineStatus}>
      <Text style={styles.inlineStatusIcon}>•</Text>
      <Text style={styles.inlineStatusText}>
        예정된 식단 · 고정 식단은 예정 목록으로 표시되며 체크한 음식만 합계에 반영됩니다.
      </Text>
    </View>
  );
}

type MealEvaluationPanelProps = {
  evaluation: MealEvaluationResult;
};

function MealEvaluationPanel({ evaluation }: MealEvaluationPanelProps) {
  const statusLabel = mealEvaluationStatusLabels[evaluation.status];
  const message = evaluation.messages.length > 0
    ? ` · ${evaluation.messages.join(' · ')}`
    : '';

  return (
    <View style={styles.inlineStatus}>
      <Text style={[styles.inlineStatusIcon, getEvaluationInlineStatusIconStyle(evaluation)]}>•</Text>
      <Text style={styles.inlineStatusText}>
        식단 평가 {evaluation.score}점 · {statusLabel}{message}
      </Text>
    </View>
  );
}

function getEvaluationInlineStatusIconStyle(evaluation: MealEvaluationResult) {
  if (evaluation.status === 'excellent' || evaluation.status === 'good') {
    return styles.inlineStatusIconSuccess;
  }

  if (evaluation.status === 'low' || evaluation.status === 'high') {
    return styles.inlineStatusIconWarning;
  }

  return styles.inlineStatusIconDanger;
}
