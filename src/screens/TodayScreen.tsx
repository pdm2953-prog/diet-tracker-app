import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { FoodPortionModal } from '../components/FoodPortionModal';
import type { FoodPortionModalState } from '../components/FoodPortionModal';
import { FoodSearchPanel } from '../components/FoodSearchPanel';
import { MealSection } from '../components/MealSection';
import { NutritionSummaryPanel } from '../components/NutritionSummaryPanel';
import { PrimaryButton, SecondaryButton, StatusBadge } from '../components/ui';
import type { StatusBadgeTone } from '../components/ui';
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
import type { Food, Meal, MealFood, MealType } from '../models';
import {
  buildDailySummary,
  calculateNutritionForConsumedGrams,
} from '../nutrition';
import type { DailyNutritionTargets } from '../nutrition';
import {
  defaultFoodSearchProvider,
  FOOD_SEARCH_RESULT_LIMIT,
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
      return;
    }

    return scheduleFoodSearchRequest({
      callbacks: {
        onStart: () => {
          setHasSearched(true);
          setIsSearching(true);
          setSearchError(null);
          setSearchResults([]);
        },
        onSuccess: (results) => {
          setSearchResults(results);
        },
        onError: (message) => {
          setSearchError(message);
          setSearchResults([]);
        },
        onFinish: () => {
          setIsSearching(false);
        },
      },
      gate: foodSearchRequestGate,
      options: { limit: FOOD_SEARCH_RESULT_LIMIT },
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
  const selectedDateStatusLabel = getSelectedDateStatusLabel(selectedDateIsToday, shouldEvaluateSelectedDate);
  const selectedDateStatusTone = getSelectedDateStatusTone(selectedDateIsToday, shouldEvaluateSelectedDate);
  const selectedDateHelpText = getSelectedDateHelpText(selectedDateIsToday, shouldEvaluateSelectedDate);
  const foodSearchIsVisible = portionModal === null;

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Today</Text>
          <View style={styles.todayHeaderRow}>
            <View style={styles.todayHeaderTextBlock}>
              <Text style={styles.title}>{formatDateLabel(selectedDate)}</Text>
              <Text style={styles.dateText}>{selectedDateHelpText}</Text>
            </View>
            <StatusBadge label={selectedDateStatusLabel} tone={selectedDateStatusTone} />
          </View>
          <View style={styles.dateControlRow}>
            <SecondaryButton
              accessibilityLabel="이전 날짜로 이동"
              label="이전"
              onPress={() => changeSelectedDate(-1)}
              style={styles.dateControlButton}
            />
            {selectedDateIsToday ? (
              <PrimaryButton
                accessibilityLabel="오늘 날짜 선택됨"
                label="오늘"
                onPress={returnToToday}
                style={[styles.dateControlButton, styles.dateControlButtonActive]}
                textStyle={styles.dateControlButtonTextActive}
              />
            ) : (
              <SecondaryButton
                accessibilityLabel="오늘 날짜로 이동"
                label="오늘"
                onPress={returnToToday}
                style={styles.dateControlButton}
              />
            )}
            <SecondaryButton
              accessibilityLabel="다음 날짜로 이동"
              label="다음"
              onPress={() => changeSelectedDate(1)}
              style={styles.dateControlButton}
            />
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
    <View style={styles.statusBanner}>
      <StatusBadge icon="•" label="예정" tone="scheduled" />
      <View style={styles.statusBannerTextBlock}>
        <Text style={styles.statusBannerTitle}>예정된 식단입니다</Text>
        <Text style={styles.statusBannerMessage}>
          미래 날짜는 실제 섭취 평가를 하지 않습니다. 고정 식단은 예정 목록으로 표시되며, 체크한 음식만 섭취량 합계에 반영됩니다.
        </Text>
      </View>
    </View>
  );
}

type MealEvaluationPanelProps = {
  evaluation: MealEvaluationResult;
};

function MealEvaluationPanel({ evaluation }: MealEvaluationPanelProps) {
  return (
    <View style={styles.statusBanner}>
      <StatusBadge
        label={mealEvaluationStatusLabels[evaluation.status]}
        tone={getEvaluationStatusBadgeTone(evaluation)}
      />
      <View style={styles.statusBannerTextBlock}>
        <View style={styles.statusBannerTitleRow}>
          <Text style={styles.statusBannerTitle}>식단 평가</Text>
          <Text style={styles.statusBannerScore}>{evaluation.score}점</Text>
        </View>
        <View style={styles.evaluationMessageList}>
          {evaluation.messages.map((message, index) => (
            <Text key={`${evaluation.status}-${index}-${message}`} style={styles.statusBannerMessage}>
              - {message}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

function getSelectedDateStatusLabel(
  selectedDateIsToday: boolean,
  shouldEvaluateSelectedDate: boolean,
): string {
  if (!shouldEvaluateSelectedDate) {
    return '예정';
  }

  return selectedDateIsToday ? '오늘' : '기록일';
}

function getSelectedDateStatusTone(
  selectedDateIsToday: boolean,
  shouldEvaluateSelectedDate: boolean,
): StatusBadgeTone {
  if (!shouldEvaluateSelectedDate) {
    return 'scheduled';
  }

  return selectedDateIsToday ? 'success' : 'info';
}

function getSelectedDateHelpText(
  selectedDateIsToday: boolean,
  shouldEvaluateSelectedDate: boolean,
): string {
  if (!shouldEvaluateSelectedDate) {
    return '예정된 식단을 확인하고 필요한 음식을 미리 준비합니다.';
  }

  return selectedDateIsToday
    ? '오늘 먹은 음식만 체크하면 칼로리와 영양 목표가 즉시 반영됩니다.'
    : '선택한 날짜의 아침, 점심, 저녁 기록을 확인합니다.';
}

function getEvaluationStatusBadgeTone(evaluation: MealEvaluationResult): StatusBadgeTone {
  if (evaluation.status === 'excellent' || evaluation.status === 'good') {
    return 'success';
  }

  if (evaluation.status === 'low' || evaluation.status === 'high') {
    return 'warning';
  }

  return 'danger';
}
