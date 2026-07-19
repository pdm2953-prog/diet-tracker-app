import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { FoodPortionModal } from '../components/FoodPortionModal';
import type { FoodPortionModalState } from '../components/FoodPortionModal';
import { FoodSearchPanel } from '../components/FoodSearchPanel';
import { MealSection } from '../components/MealSection';
import { NutritionSummaryPanel } from '../components/NutritionSummaryPanel';
import { GRAM_ADJUST_STEP } from '../constants';
import {
  addFoodToMeals,
  getMealsForDate,
  hasValidGramServing,
  normalizeConsumedGrams,
  updateMealsForDate,
} from '../meals';
import {
  evaluateDailyMeal,
  mealEvaluationStatusLabels,
} from '../mealEvaluation';
import type { MealEvaluationResult } from '../mealEvaluation';
import { createMockTodayData } from '../mockTodayData';
import type { Food, Meal, MealsByDate, MealType } from '../models';
import {
  buildDailySummary,
  calculateNutritionForConsumedGrams,
} from '../nutrition';
import type { DailyNutritionTargets } from '../nutrition';
import {
  FOOD_SEARCH_RESULT_LIMIT,
  mockFoodSearchProvider,
} from '../services/foodSearch';
import type { FoodSearchResult } from '../services/foodSearch';
import { styles } from '../styles';
import {
  formatAmountLabel,
  formatDateLabel,
  getLocalDateString,
  parseNumberInput,
  shiftLocalDateString,
} from '../utils/format';

let mealFoodIdSequence = 0;

type TodayScreenProps = {
  targets: DailyNutritionTargets;
};

function createMealFoodId(foodId: string): string {
  mealFoodIdSequence += 1;

  return `meal-food-${foodId}-${Date.now()}-${mealFoodIdSequence}`;
}

function createInitialTodayScreenData() {
  const initialDate = getLocalDateString();

  return {
    date: initialDate,
    mockData: createMockTodayData(initialDate),
  };
}

export function TodayScreen({ targets }: TodayScreenProps) {
  const [initialData] = useState(createInitialTodayScreenData);
  const currentToday = getLocalDateString();
  const [selectedDate, setSelectedDate] = useState(initialData.date);
  const [foods, setFoods] = useState<Food[]>(() => initialData.mockData.foods);
  const [mealsByDate, setMealsByDate] = useState<MealsByDate>(() => ({
    [initialData.date]: initialData.mockData.meals,
  }));
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FoodSearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeSearchMealType, setActiveSearchMealType] = useState<MealType | null>(null);
  const [portionModal, setPortionModal] = useState<FoodPortionModalState | null>(null);
  const [portionGramsInput, setPortionGramsInput] = useState('');
  const selectedMeals = useMemo(
    () => getMealsForDate(mealsByDate, selectedDate),
    [mealsByDate, selectedDate],
  );
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
  const mealEvaluation = useMemo(
    () => evaluateDailyMeal(dailySummary, targets),
    [dailySummary, targets],
  );

  const updateSelectedDateMeals = (
    updatedAt: string,
    updateMeals: (currentMeals: Meal[]) => Meal[],
  ) => {
    setMealsByDate((currentMealsByDate) =>
      updateMealsForDate(currentMealsByDate, selectedDate, updateMeals, updatedAt),
    );
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
    setSelectedDate((currentDate) => shiftLocalDateString(currentDate, dayDelta));
  };

  const returnToToday = () => {
    closeFoodSearch();
    closePortionModal();
    setSelectedDate(getLocalDateString());
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

    updateSelectedDateMeals(updatedAt, (currentMeals) =>
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
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Today</Text>
          <Text style={styles.title}>선택 날짜 식단</Text>
          <Text style={styles.dateText}>{formatDateLabel(selectedDate)}</Text>
          <View style={styles.dateControlRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => changeSelectedDate(-1)}
              style={({ pressed }) => [
                styles.dateControlButton,
                pressed ? styles.dateControlButtonPressed : null,
              ]}
            >
              <Text style={styles.dateControlButtonText}>이전</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={returnToToday}
              style={({ pressed }) => [
                styles.dateControlButton,
                selectedDate === currentToday ? styles.dateControlButtonActive : null,
                pressed ? styles.dateControlButtonPressed : null,
              ]}
            >
              <Text
                style={[
                  styles.dateControlButtonText,
                  selectedDate === currentToday ? styles.dateControlButtonTextActive : null,
                ]}
              >
                오늘
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => changeSelectedDate(1)}
              style={({ pressed }) => [
                styles.dateControlButton,
                pressed ? styles.dateControlButtonPressed : null,
              ]}
            >
              <Text style={styles.dateControlButtonText}>다음</Text>
            </Pressable>
          </View>
        </View>

        <NutritionSummaryPanel summary={dailySummary} targets={targets} />
        <MealEvaluationPanel evaluation={mealEvaluation} />

        <View style={styles.mealStack}>
          {selectedMeals.map((meal) => (
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

type MealEvaluationPanelProps = {
  evaluation: MealEvaluationResult;
};

function MealEvaluationPanel({ evaluation }: MealEvaluationPanelProps) {
  return (
    <View style={styles.evaluationPanel}>
      <View style={styles.evaluationHeader}>
        <View>
          <Text style={styles.sectionTitle}>식단 평가</Text>
          <Text style={styles.sectionSubtitle}>체크한 음식과 목표 영양성분 기준</Text>
        </View>
        <Text style={styles.evaluationStatusBadge}>
          {mealEvaluationStatusLabels[evaluation.status]}
        </Text>
      </View>
      <Text style={styles.evaluationScoreText}>{evaluation.score}점</Text>
      <View style={styles.evaluationMessageList}>
        {evaluation.messages.map((message, index) => (
          <Text key={`${evaluation.status}-${index}-${message}`} style={styles.evaluationMessageText}>
            - {message}
          </Text>
        ))}
      </View>
    </View>
  );
}
