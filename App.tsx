import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { createMockTodayData } from './src/mockTodayData';
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
  nutritionLabels,
  nutritionUnits,
  primaryNutritionFields,
} from './src/nutrition';

const mealLabels: Record<MealType, string> = {
  breakfast: '아침',
  lunch: '점심',
  dinner: '저녁',
};

type PrimaryNutritionField = (typeof primaryNutritionFields)[number];

function isPrimaryNutritionField(
  field: NutritionField,
): field is PrimaryNutritionField {
  return (primaryNutritionFields as readonly NutritionField[]).includes(field);
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
  const foodsById = useMemo<Record<string, Food>>(
    () =>
      Object.fromEntries(
        mockData.foods.map((food) => [food.id, food]),
      ) as Record<string, Food>,
    [mockData.foods],
  );
  const [meals, setMeals] = useState<Meal[]>(() => mockData.meals);
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
              onToggle={toggleMealFood}
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
    </SafeAreaView>
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

type MealSectionProps = {
  foodsById: Record<string, Food>;
  meal: Meal;
  onToggle: (mealId: string, mealFoodId: string) => void;
  summary: MealSummary | null | undefined;
};

function MealSection({ foodsById, meal, onToggle, summary }: MealSectionProps) {
  const calories = summary?.checkedNutritionTotal.caloriesKcal ?? null;
  const protein = summary?.checkedNutritionTotal.proteinG ?? null;

  return (
    <View style={styles.mealSection}>
      <View style={styles.mealHeader}>
        <View>
          <Text style={styles.mealTitle}>{mealLabels[meal.type]}</Text>
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

      <View style={styles.foodList}>
        {meal.foods.map((mealFood, index) => (
          <FoodRow
            key={mealFood.id}
            food={foodsById[mealFood.foodId]}
            isLast={index === meal.foods.length - 1}
            mealFood={mealFood}
            onPress={() => onToggle(meal.id, mealFood.id)}
          />
        ))}
      </View>
    </View>
  );
}

type FoodRowProps = {
  food: Food | undefined;
  isLast: boolean;
  mealFood: MealFood;
  onPress: () => void;
};

function FoodRow({ food, isLast, mealFood, onPress }: FoodRowProps) {
  const missingPrimaryFields = primaryNutritionFields.filter(
    (field) => mealFood.calculatedNutrition[field] === null,
  );

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
          <Text style={styles.foodName}>{food?.name ?? '알 수 없는 음식'}</Text>
          <Text style={styles.foodAmount}>
            {mealFood.amount} {mealFood.amountUnit}
          </Text>
        </View>
        <Text style={styles.foodMeta}>
          {food?.category ?? '분류 없음'} · 기준 {food?.servingSize ?? '정보 없음'} {food?.servingUnit ?? ''}
        </Text>

        <View style={styles.foodNutritionLine}>
          {primaryNutritionFields.map((field) => (
            <Text key={field} style={styles.foodNutritionText}>
              {nutritionLabels[field]} {formatNutritionNumber(field, mealFood.calculatedNutrition[field])}
              {mealFood.calculatedNutrition[field] === null
                ? ''
                : ` ${nutritionUnits[field]}`}
            </Text>
          ))}
        </View>

        {missingPrimaryFields.length > 0 ? (
          <Text style={styles.foodWarning}>
            {missingPrimaryFields.map((field) => nutritionLabels[field]).join(', ')} 정보 없음
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
  foodAmount: {
    color: '#40503d',
    fontSize: 13,
    fontWeight: '700',
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
  disclaimer: {
    color: '#687265',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 18,
  },
});
