import { Pressable, Text, View } from 'react-native';

import {
  fixedMealWeekdayLabels,
  fixedMealWeekdayPresets,
  fixedMealWeekdays,
  normalizeFixedMealWeekdays,
  toggleFixedMealWeekdaySelection,
} from '../fixedMealRecurrence';
import type { FixedMealWeekday } from '../models';
import { styles } from '../styles';

type FixedMealWeekdaySelectorProps = {
  onChangeWeekdays: (weekdays: FixedMealWeekday[]) => void;
  testIDPrefix: string;
  title: string;
  weekdays: readonly FixedMealWeekday[];
};

export function FixedMealWeekdaySelector({
  onChangeWeekdays,
  testIDPrefix,
  title,
  weekdays,
}: FixedMealWeekdaySelectorProps) {
  const normalizedWeekdays = normalizeFixedMealWeekdays(weekdays);

  return (
    <View style={styles.fixedMealWeekdayEditor}>
      <Text style={styles.fixedMealWeekdayEditorLabel}>반복 요일</Text>

      <View style={styles.fixedMealPresetRow}>
        {fixedMealWeekdayPresets.map((preset) => {
          const selected = isSameWeekdaySelection(normalizedWeekdays, preset.weekdays);

          return (
            <Pressable
              accessibilityLabel={`${title} ${preset.label} 반복 설정`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={preset.key}
              onPress={() => onChangeWeekdays([...preset.weekdays])}
              style={({ pressed }) => [
                styles.fixedMealPresetButton,
                selected ? styles.fixedMealPresetButtonSelected : null,
                pressed ? styles.addFoodCompactButtonPressed : null,
              ]}
              testID={`fixed-meal-preset-${testIDPrefix}-${preset.key}`}
            >
              <Text
                style={[
                  styles.fixedMealPresetButtonText,
                  selected ? styles.fixedMealPresetButtonTextSelected : null,
                ]}
              >
                {preset.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.fixedMealWeekdayRow}>
        {fixedMealWeekdays.map((weekday) => {
          const selected = normalizedWeekdays.includes(weekday);
          const disabled = selected && normalizedWeekdays.length === 1;

          return (
            <Pressable
              accessibilityLabel={`${title} ${fixedMealWeekdayLabels[weekday]}요일 반복 ${selected ? '선택됨' : '미선택'}`}
              accessibilityRole="button"
              accessibilityState={{ disabled, selected }}
              disabled={disabled}
              key={weekday}
              onPress={() => onChangeWeekdays(toggleFixedMealWeekdaySelection(normalizedWeekdays, weekday))}
              style={({ pressed }) => [
                styles.fixedMealWeekdayChip,
                selected ? styles.fixedMealWeekdayChipSelected : null,
                disabled ? styles.fixedMealWeekdayChipDisabled : null,
                pressed && !disabled ? styles.addFoodCompactButtonPressed : null,
              ]}
              testID={`fixed-meal-weekday-${testIDPrefix}-${weekday}`}
            >
              <Text
                style={[
                  styles.fixedMealWeekdayChipText,
                  selected ? styles.fixedMealWeekdayChipTextSelected : null,
                ]}
              >
                {fixedMealWeekdayLabels[weekday]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function isSameWeekdaySelection(
  firstWeekdays: readonly FixedMealWeekday[],
  secondWeekdays: readonly FixedMealWeekday[],
): boolean {
  const firstNormalized = normalizeFixedMealWeekdays(firstWeekdays);
  const secondNormalized = normalizeFixedMealWeekdays(secondWeekdays);

  return firstNormalized.length === secondNormalized.length
    && firstNormalized.every((weekday, index) => weekday === secondNormalized[index]);
}
