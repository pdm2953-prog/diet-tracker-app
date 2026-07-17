import { Text, View } from 'react-native';

import type { DailySummary, NutritionField } from '../models';
import {
  formatNutritionValue,
  nutritionLabels,
  primaryNutritionFields,
} from '../nutrition';
import type { DailyNutritionTargets, PrimaryNutritionField } from '../nutrition';
import { styles } from '../styles';
import { isPrimaryNutritionField } from '../utils/nutritionUi';

type NutritionSummaryPanelProps = {
  summary: DailySummary;
  targets: DailyNutritionTargets;
};

export function NutritionSummaryPanel({
  summary,
  targets,
}: NutritionSummaryPanelProps) {
  return (
    <View style={styles.summaryPanel}>
      <View style={styles.summaryHeader}>
        <View>
          <Text style={styles.sectionTitle}>하루 섭취량</Text>
          <Text style={styles.sectionSubtitle}>체크한 음식만 합산</Text>
        </View>
        <Text style={styles.checkedCountText}>{summary.checkedCount}개 체크</Text>
      </View>

      {summary.missingNutritionFields.length > 0 ? (
        <MissingNutritionNotice missingFields={summary.missingNutritionFields} />
      ) : null}

      <View style={styles.metricsStack}>
        {primaryNutritionFields.map((field) => (
          <ProgressMetric
            key={field}
            field={field}
            isMissing={summary.missingNutritionFields.includes(field)}
            target={targets[field]}
            value={summary.checkedNutritionTotal[field]}
          />
        ))}
      </View>
    </View>
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
  target: number | null;
  value: number | null;
};

function ProgressMetric({ field, isMissing, target, value }: ProgressMetricProps) {
  const hasUsableTarget = target !== null && Number.isFinite(target) && target > 0;
  const progressTarget = hasUsableTarget ? target : 1;
  const progressRatio = value === null ? 0 : Math.min(value / progressTarget, 1);
  const progressWidth = `${Math.round(progressRatio * 100)}%` as `${number}%`;
  const valueLabel = formatNutritionValue(field, value);
  const targetLabel = formatNutritionValue(field, target);
  const progressLabel =
    value === null || !hasUsableTarget
      ? '0%'
      : `${Math.round((value / target) * 100)}%`;

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
