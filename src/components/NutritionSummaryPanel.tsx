import { Text, View } from 'react-native';

import { Card, MacroProgressRow, WarningBox } from './ui';
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
    <Card style={styles.summaryPanelHero}>
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
    </Card>
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
  const targetValue = target !== null && Number.isFinite(target) && target > 0
    ? target
    : null;
  const progressRatio = value === null || targetValue === null
    ? 0
    : Math.min(value / targetValue, 1);
  const valueLabel = formatNutritionValue(field, value);
  const targetLabel = formatNutritionValue(field, target);
  const progressLabel = value === null || targetValue === null
    ? '0%'
    : `${Math.round((value / targetValue) * 100)}%`;

  return (
    <MacroProgressRow
      label={nutritionLabels[field]}
      meta={`목표 ${targetLabel} 중 ${progressLabel}`}
      progress={progressRatio}
      value={valueLabel}
      warning={isMissing ? '일부 음식 정보 없음' : undefined}
    />
  );
}
