import { Text, View } from 'react-native';

import { AppCard, MacroProgressRow, StatusBadge, WarningBox } from './ui';
import type { DailySummary, NutritionField } from '../models';
import {
  formatNutritionValue,
  nutritionLabels,
} from '../nutrition';
import type { DailyNutritionTargets, PrimaryNutritionField } from '../nutrition';
import { styles } from '../styles';
import { isPrimaryNutritionField } from '../utils/nutritionUi';

const macroNutritionFields = [
  'proteinG',
  'carbohydrateG',
  'fatG',
] as const satisfies readonly PrimaryNutritionField[];

type NutritionSummaryPanelProps = {
  summary: DailySummary;
  targets: DailyNutritionTargets;
};

export function NutritionSummaryPanel({
  summary,
  targets,
}: NutritionSummaryPanelProps) {
  const calories = summary.checkedNutritionTotal.caloriesKcal;
  const calorieTarget = targets.caloriesKcal;
  const calorieProgress = getProgressRatio(calories, calorieTarget);
  const calorieProgressWidth = `${Math.round(calorieProgress * 100)}%` as `${number}%`;
  const calorieProgressLabel = getProgressLabel(calories, calorieTarget);
  const remainingCalories = getRemainingValue(calories, calorieTarget);

  return (
    <AppCard style={styles.summaryPanelHero} variant="hero">
      <View style={styles.calorieHeroTopline}>
        <View style={styles.calorieHeroValueBlock}>
          <Text style={styles.summaryKicker}>체크 기준 섭취 칼로리</Text>
          <Text style={styles.calorieHeroValue}>
            {formatNutritionValue('caloriesKcal', calories)}
          </Text>
          <Text style={styles.calorieHeroMeta}>
            목표 {formatNutritionValue('caloriesKcal', calorieTarget)} · {calorieProgressLabel} 달성
          </Text>
        </View>
        <StatusBadge
          icon="✓"
          label={`${summary.checkedCount}/${summary.totalCount} 체크`}
          tone="success"
        />
      </View>

      <View style={styles.heroProgressTrack}>
        <View style={[styles.heroProgressFill, { width: calorieProgressWidth }]} />
      </View>

      <View style={styles.calorieStatsGrid}>
        <View style={styles.calorieStatItem}>
          <Text style={styles.calorieStatLabel}>현재</Text>
          <Text style={styles.calorieStatValue}>{formatNutritionValue('caloriesKcal', calories)}</Text>
        </View>
        <View style={styles.calorieStatItem}>
          <Text style={styles.calorieStatLabel}>목표</Text>
          <Text style={styles.calorieStatValue}>{formatNutritionValue('caloriesKcal', calorieTarget)}</Text>
        </View>
        <View style={styles.calorieStatItem}>
          <Text style={styles.calorieStatLabel}>남은 목표</Text>
          <Text style={styles.calorieStatValue}>
            {remainingCalories === null ? '정보 없음' : formatNutritionValue('caloriesKcal', remainingCalories)}
          </Text>
        </View>
      </View>

      {summary.missingNutritionFields.length > 0 ? (
        <MissingNutritionNotice missingFields={summary.missingNutritionFields} />
      ) : null}

      <View style={styles.summaryMacroList}>
        {macroNutritionFields.map((field) => (
          <ProgressMetric
            key={field}
            field={field}
            isMissing={summary.missingNutritionFields.includes(field)}
            target={targets[field]}
            value={summary.checkedNutritionTotal[field]}
          />
        ))}
      </View>
    </AppCard>
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
    <WarningBox
      message={`${missingFieldNames.join(', ')} 값이 없는 음식은 해당 항목 합산에서 제외했습니다.`}
      title="일부 영양정보 없음"
    />
  );
}

type ProgressMetricProps = {
  field: PrimaryNutritionField;
  isMissing: boolean;
  target: number | null;
  value: number | null;
};

function ProgressMetric({ field, isMissing, target, value }: ProgressMetricProps) {
  const progressRatio = getProgressRatio(value, target);
  const valueLabel = formatNutritionValue(field, value);
  const targetLabel = formatNutritionValue(field, target);
  const progressLabel = getProgressLabel(value, target);

  return (
    <MacroProgressRow
      label={nutritionLabels[field]}
      meta={`목표 ${targetLabel} 중 ${progressLabel}`}
      progress={progressRatio}
      tone={getMacroTone(field)}
      value={valueLabel}
      warning={isMissing ? '일부 음식 정보 없음' : undefined}
    />
  );
}

function getProgressRatio(value: number | null, target: number | null): number {
  if (value === null || target === null || !Number.isFinite(target) || target <= 0) {
    return 0;
  }

  return Math.min(value / target, 1);
}

function getProgressLabel(value: number | null, target: number | null): string {
  if (value === null || target === null || !Number.isFinite(target) || target <= 0) {
    return '0%';
  }

  return `${Math.round((value / target) * 100)}%`;
}

function getRemainingValue(value: number | null, target: number | null): number | null {
  if (value === null || target === null || !Number.isFinite(target)) {
    return null;
  }

  return Math.max(target - value, 0);
}

function getMacroTone(field: PrimaryNutritionField): 'carbohydrate' | 'fat' | 'protein' {
  if (field === 'carbohydrateG') {
    return 'carbohydrate';
  }

  if (field === 'fatG') {
    return 'fat';
  }

  return 'protein';
}
