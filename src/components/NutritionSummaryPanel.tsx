import { Text, View } from 'react-native';

import type { DailySummary } from '../models';
import type { DailyNutritionTargets } from '../nutrition';
import { styles } from '../styles';
import {
  createCalorieHeroModel,
  createMacroMetricModels,
  getMissingPrimaryNutritionLabel,
} from '../todayPresentation';

type NutritionSummaryPanelProps = {
  summary: DailySummary;
  targets: DailyNutritionTargets;
};

export function NutritionSummaryPanel({
  summary,
  targets,
}: NutritionSummaryPanelProps) {
  const calorieHero = createCalorieHeroModel(summary, targets);
  const macroMetrics = createMacroMetricModels(summary, targets);
  const missingNutritionLabel = getMissingPrimaryNutritionLabel(summary.missingNutritionFields);

  return (
    <View style={styles.summaryPanelHero}>
      <View style={styles.calorieHeroValueBlock}>
        <Text style={styles.summaryKicker}>오늘 남은 칼로리</Text>
        <View style={styles.calorieHeroMetricRow}>
          <Text style={styles.calorieHeroValue}>{calorieHero.remainingLabel}</Text>
          <Text style={styles.calorieHeroUnit}>kcal</Text>
        </View>
        <View style={styles.calorieHeroMetaRow}>
          <Text style={styles.calorieHeroMeta}>{calorieHero.contextLabel}</Text>
          <Text style={styles.calorieHeroProgressLabel}>{calorieHero.progressLabel}</Text>
        </View>
        <View style={styles.heroProgressTrack}>
          <View style={[styles.heroProgressFill, { width: calorieHero.progressWidth }]} />
        </View>
      </View>

      <View style={styles.summaryMacroList}>
        {macroMetrics.map((macro) => (
          <View key={macro.field} style={styles.summaryMacroItem}>
            <Text style={styles.summaryMacroLabel}>{macro.label}</Text>
            <Text numberOfLines={1} style={styles.summaryMacroValue}>{macro.valueLabel}</Text>
            <View style={styles.summaryMacroProgressTrack}>
              <View
                style={[
                  styles.summaryMacroProgressFill,
                  macro.isMissing ? styles.summaryMacroProgressFillMuted : null,
                  { width: macro.progressWidth },
                ]}
              />
            </View>
          </View>
        ))}
      </View>

      {missingNutritionLabel !== null ? (
        <View style={styles.inlineStatus}>
          <Text style={[styles.inlineStatusIcon, styles.inlineStatusIconWarning]}>!</Text>
          <Text style={styles.inlineStatusText}>{missingNutritionLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}
