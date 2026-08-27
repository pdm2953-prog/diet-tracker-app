import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import type { ViewStyle } from 'react-native';
import { SafeAreaView, Text, View } from 'react-native';

import {
  applyFixedMealTemplatesToMeals,
  createPromotedFixedMealTemplateIds,
  getFixedMealTemplateFoodSnapshots,
  getHiddenFixedMealSourceKeysForDate,
  promoteMealFoodInMeals,
  promoteMealFoodToFixedMeal,
  hideFixedMealSourceKeyForDate,
  removeFixedMealTemplateById,
  setFixedMealTemplateActive,
  setFixedMealTemplateWeekdays,
} from './src/fixedMeals';
import {
  createNutritionGoalHistoryEntry,
  resolveNutritionGoalForDate,
  upsertNutritionGoalHistoryEntry,
} from './src/goalHistory';
import type { NutritionGoalHistoryEntry } from './src/goalHistory';
import { shouldPersistAppDataSnapshot, shouldRenderInteractiveApp } from './src/appHydration';
import { getMealsForDate, hasValidGramServing, normalizeConsumedGrams } from './src/meals';
import { bottomTabs, getGoalSetupScreenKey } from './src/navigation';
import type { ScreenKey } from './src/navigation';
import { createMockTodayData } from './src/mockTodayData';
import type {
  FixedMealTemplate,
  FixedMealWeekday,
  Food,
  HiddenFixedMealSourceKeysByDate,
  Meal,
  MealFood,
  MealsByDate,
  MealType,
} from './src/models';
import { calculateNutritionForConsumedGrams } from './src/nutrition';
import type { DailyNutritionTargets } from './src/nutrition';
import type { NutritionGoalType } from './src/nutritionGoals';
import { BottomTabItem } from './src/components/ui';
import { CalendarScreen } from './src/screens/CalendarScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TargetScreen } from './src/screens/TargetScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import {
  createDefaultAppDataSnapshot,
  loadAppDataSnapshot,
  saveAppDataSnapshot,
} from './src/storage';
import { styles } from './src/styles';
import { getLocalDateString } from './src/utils/format';


type InitialAppState = {
  fixedMealTemplates: FixedMealTemplate[];
  foods: Food[];
  goalHistory: NutritionGoalHistoryEntry[];
  hiddenFixedMealSourceKeys: HiddenFixedMealSourceKeysByDate;
  mealsByDate: MealsByDate;
  nutritionGoalType: NutritionGoalType;
  selectedDate: string;
  todayTargets: DailyNutritionTargets;
};


const screenPaneStyle: ViewStyle = { flex: 1 };
const hiddenScreenPaneStyle: ViewStyle = { display: 'none' };
const tabButtonFillStyle: ViewStyle = { flex: 1 };

function createInitialAppState(): InitialAppState {
  const selectedDate = getLocalDateString();
  const mockData = createMockTodayData(selectedDate);
  const fallbackData = createDefaultAppDataSnapshot(mockData.foods, {
    [selectedDate]: mockData.meals,
  });
  return {
    selectedDate,
    fixedMealTemplates: fallbackData.fixedMealTemplates,
    foods: fallbackData.foods,
    goalHistory: fallbackData.goalHistory,
    hiddenFixedMealSourceKeys: fallbackData.hiddenFixedMealSourceKeys,
    mealsByDate: fallbackData.mealsByDate,
    nutritionGoalType: fallbackData.nutritionGoalType,
    todayTargets: fallbackData.todayTargets,
  };
}

function mergeFoodsById(foods: Food[], fixedMealTemplates: FixedMealTemplate[]): Food[] {
  const foodsById = new Map<string, Food>();

  for (const food of foods) {
    foodsById.set(food.id, food);
  }

  for (const food of getFixedMealTemplateFoodSnapshots(fixedMealTemplates)) {
    if (!foodsById.has(food.id)) {
      foodsById.set(food.id, food);
    }
  }

  return [...foodsById.values()];
}

export default function App() {
  const [initialAppState] = useState(createInitialAppState);
  const [activeTab, setActiveTab] = useState<ScreenKey>('today');
  const [selectedDate, setSelectedDate] = useState(initialAppState.selectedDate);
  const [foods, setFoods] = useState<Food[]>(initialAppState.foods);
  const [mealsByDate, setMealsByDate] = useState<MealsByDate>(initialAppState.mealsByDate);
  const [fixedMealTemplates, setFixedMealTemplates] = useState<FixedMealTemplate[]>(
    initialAppState.fixedMealTemplates,
  );
  const [hiddenFixedMealSourceKeys, setHiddenFixedMealSourceKeys] =
    useState<HiddenFixedMealSourceKeysByDate>(initialAppState.hiddenFixedMealSourceKeys);
  const [goalHistory, setGoalHistory] = useState<NutritionGoalHistoryEntry[]>(
    initialAppState.goalHistory,
  );
  const [storageLoaded, setStorageLoaded] = useState(false);
  const todayDate = getLocalDateString();
  const todayGoal = useMemo(
    () => resolveNutritionGoalForDate(goalHistory, todayDate),
    [goalHistory, todayDate],
  );
  const selectedDateGoal = useMemo(
    () => resolveNutritionGoalForDate(goalHistory, selectedDate),
    [goalHistory, selectedDate],
  );
  const visibleFoods = useMemo(
    () => mergeFoodsById(foods, fixedMealTemplates),
    [fixedMealTemplates, foods],
  );
  const selectedMeals = useMemo(
    () => buildVisibleMealsForDate(selectedDate, mealsByDate),
    [fixedMealTemplates, hiddenFixedMealSourceKeys, mealsByDate, selectedDate],
  );

  function buildVisibleMealsForDate(
    date: string,
    currentMealsByDate: MealsByDate,
  ): Meal[] {
    return applyFixedMealTemplatesToMeals({
      date,
      fixedMealTemplates,
      hiddenSourceKeys: getHiddenFixedMealSourceKeysForDate(
        hiddenFixedMealSourceKeys,
        date,
      ),
      meals: getMealsForDate(currentMealsByDate, date),
      timestamp: `${date}T00:00:00.000`,
    });
  }

  useEffect(() => {
    let isMounted = true;
    const fallbackData = {
      fixedMealTemplates: initialAppState.fixedMealTemplates,
      foods: initialAppState.foods,
      goalHistory: initialAppState.goalHistory,
      hiddenFixedMealSourceKeys: initialAppState.hiddenFixedMealSourceKeys,
      mealsByDate: initialAppState.mealsByDate,
      nutritionGoalType: initialAppState.nutritionGoalType,
      todayTargets: initialAppState.todayTargets,
    };

    loadAppDataSnapshot(fallbackData).then((restoredData) => {
      if (!isMounted) {
        return;
      }

      setFixedMealTemplates(restoredData.fixedMealTemplates);
      setFoods(restoredData.foods);
      setGoalHistory(restoredData.goalHistory);
      setHiddenFixedMealSourceKeys(restoredData.hiddenFixedMealSourceKeys);
      setMealsByDate(restoredData.mealsByDate);
      setStorageLoaded(true);
    });

    return () => {
      isMounted = false;
    };
  }, [initialAppState]);

  useEffect(() => {
    if (!shouldPersistAppDataSnapshot(storageLoaded)) {
      return;
    }

    void saveAppDataSnapshot({
      fixedMealTemplates,
      foods,
      goalHistory,
      hiddenFixedMealSourceKeys,
      mealsByDate,
      nutritionGoalType: todayGoal.goalType,
      todayTargets: todayGoal.targets,
    });
  }, [fixedMealTemplates, foods, goalHistory, hiddenFixedMealSourceKeys, mealsByDate, storageLoaded, todayGoal]);

  const updateSelectedDateMeals = (
    updatedAt: string,
    updateMeals: (currentMeals: Meal[]) => Meal[],
  ) => {
    setMealsByDate((currentMealsByDate) => ({
      ...currentMealsByDate,
      [selectedDate]: updateMeals(buildVisibleMealsForDate(selectedDate, currentMealsByDate)),
    }));
  };

  const createFixedMealTemplate = (
    mealType: MealType,
    mealFood: MealFood,
    food: Food,
  ) => {
    const timestamp = new Date().toISOString();
    const { templateId, templateItemId } = createPromotedFixedMealTemplateIds(
      mealType,
      mealFood,
    );
    const promotion = promoteMealFoodToFixedMeal({
      fixedMealTemplates,
      food,
      mealFood,
      mealType,
      templateId,
      templateItemId,
      timestamp,
    });
    const sourceFields = promotion.sourceFields;

    if (sourceFields === null) {
      return;
    }

    setFixedMealTemplates((currentTemplates) =>
      promoteMealFoodToFixedMeal({
        fixedMealTemplates: currentTemplates,
        food,
        mealFood,
        mealType,
        templateId,
        templateItemId,
        timestamp,
      }).fixedMealTemplates,
    );

    setMealsByDate((currentMealsByDate) => ({
      ...currentMealsByDate,
      [selectedDate]: promoteMealFoodInMeals({
        mealFoodId: mealFood.id,
        meals: buildVisibleMealsForDate(selectedDate, currentMealsByDate),
        sourceFields,
        timestamp,
      }),
    }));
  };

  const createFixedMealTemplateFromFood = (
    mealType: MealType,
    food: Food,
    consumedGrams: number,
    weekdays: readonly FixedMealWeekday[],
  ) => {
    const normalizedConsumedGrams = normalizeConsumedGrams(consumedGrams);

    if (!hasValidGramServing(food) || normalizedConsumedGrams <= 0) {
      return;
    }

    const timestamp = new Date().toISOString();
    const mealFood: MealFood = {
      id: `fixed-template-source-${food.id}-${Date.now()}`,
      foodId: food.id,
      mealId: `fixed-template-${mealType}`,
      consumedGrams: normalizedConsumedGrams,
      checked: false,
      calculatedNutrition: calculateNutritionForConsumedGrams(
        food.nutritionPerServing,
        normalizedConsumedGrams,
        food.servingSize,
      ),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const { templateId, templateItemId } = createPromotedFixedMealTemplateIds(
      mealType,
      mealFood,
      weekdays,
    );

    setFoods((currentFoods) =>
      currentFoods.some((currentFood) => currentFood.id === food.id)
        ? currentFoods
        : [...currentFoods, food],
    );

    setFixedMealTemplates((currentTemplates) =>
      promoteMealFoodToFixedMeal({
        fixedMealTemplates: currentTemplates,
        food,
        mealFood,
        mealType,
        templateId,
        templateItemId,
        timestamp,
        weekdays,
      }).fixedMealTemplates,
    );
  };

  const setFixedMealTemplateActiveState = (templateId: string, isActive: boolean) => {
    const updatedAt = new Date().toISOString();

    setFixedMealTemplates((currentTemplates) =>
      setFixedMealTemplateActive(currentTemplates, templateId, isActive, updatedAt),
    );
  };

  const setFixedMealTemplateWeekdaysState = (
    templateId: string,
    weekdays: readonly FixedMealWeekday[],
  ) => {
    const updatedAt = new Date().toISOString();

    setFixedMealTemplates((currentTemplates) =>
      setFixedMealTemplateWeekdays(currentTemplates, templateId, weekdays, updatedAt),
    );
  };


  const removeFixedMealTemplate = (templateId: string) => {
    setFixedMealTemplates((currentTemplates) =>
      removeFixedMealTemplateById(currentTemplates, templateId),
    );
  };
  const hideFixedMealForDate = (date: string, sourceKey: string) => {
    setHiddenFixedMealSourceKeys((currentSourceKeys) =>
      hideFixedMealSourceKeyForDate(currentSourceKeys, date, sourceKey),
    );
  };

  const applyTargetsFromGoalSetup = (
    targets: DailyNutritionTargets,
    goalType: NutritionGoalType,
  ) => {
    setGoalHistory((currentGoalHistory) =>
      upsertNutritionGoalHistoryEntry(
        currentGoalHistory,
        createNutritionGoalHistoryEntry(getLocalDateString(), goalType, targets),
      ),
    );
  };

  if (!shouldRenderInteractiveApp(storageLoaded)) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="dark" />
        <View style={styles.loadingScreen}>
          <Text style={styles.loadingTitle}>식단 데이터를 불러오는 중</Text>
          <Text style={styles.loadingText}>저장된 식단과 목표를 확인하고 있습니다.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.appContent}>
        <View style={[screenPaneStyle, activeTab !== 'today' ? hiddenScreenPaneStyle : null]}>
          <TodayScreen
            foods={visibleFoods}
            fixedMealTemplates={fixedMealTemplates}
            onCreateFixedMealTemplate={createFixedMealTemplate}
            onCreateFixedMealTemplateFromFood={createFixedMealTemplateFromFood}
            onFoodsChange={setFoods}
            onHideFixedMealSourceKey={hideFixedMealForDate}
            onRemoveFixedMealTemplate={removeFixedMealTemplate}
            onSetFixedMealTemplateActive={setFixedMealTemplateActiveState}
            onSetFixedMealTemplateWeekdays={setFixedMealTemplateWeekdaysState}
            onSelectedDateChange={setSelectedDate}
            onUpdateSelectedDateMeals={updateSelectedDateMeals}
            selectedDate={selectedDate}
            selectedMeals={selectedMeals}
            targets={selectedDateGoal.targets}
          />
        </View>
        <View style={[screenPaneStyle, activeTab !== 'calendar' ? hiddenScreenPaneStyle : null]}>
          <CalendarScreen
            fixedMealTemplates={fixedMealTemplates}
            foods={visibleFoods}

            hiddenFixedMealSourceKeys={hiddenFixedMealSourceKeys}
            mealsByDate={mealsByDate}
            onOpenToday={() => setActiveTab('today')}
            onSelectedDateChange={setSelectedDate}
            selectedDate={selectedDate}
            goalHistory={goalHistory}
          />
        </View>
        <View style={[screenPaneStyle, activeTab !== 'target' ? hiddenScreenPaneStyle : null]}>
          <TargetScreen
            currentGoalType={todayGoal.goalType}
            currentTargets={todayGoal.targets}
            onTargetsChange={applyTargetsFromGoalSetup}
          />
        </View>
        <View style={[screenPaneStyle, activeTab !== 'settings' ? hiddenScreenPaneStyle : null]}>
          <SettingsScreen
            nutritionGoalType={todayGoal.goalType}
            onOpenGoalSetup={() => setActiveTab(getGoalSetupScreenKey())}
            targets={todayGoal.targets}
          />
        </View>
      </View>

      <View style={styles.tabBar}>
        {bottomTabs.map((tab) => (
          <BottomTabItem
            icon={tab.icon}
            key={tab.key}
            label={tab.label}
            onPress={() => setActiveTab(tab.key)}
            selected={activeTab === tab.key}
            style={tabButtonFillStyle}
          />
        ))}
      </View>
    </SafeAreaView>
  );
}
