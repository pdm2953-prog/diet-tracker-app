import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { colors } from '../constants';
import type { DailyNutritionTargets } from '../nutrition';
import {
  activityLevelDescriptions,
  activityLevelLabels,
  applyNutritionGoalRecommendationTargets,
  bmiCategoryLabels,
  calculateNutritionGoalRecommendation,
  nutritionGoalLabels,
  sexLabels,
} from '../nutritionGoals';
import type {
  ActivityLevel,
  GoalCalculationMode,
  NutritionGoalRecommendation,
  NutritionGoalType,
  Sex,
} from '../nutritionGoals';
import { styles } from '../styles';
import {
  formatBmiValue,
  formatGramValue,
  formatKcalValue,
  parseNumberInput,
  parseOptionalNumberInput,
} from '../utils/format';
import { Card, NoticeBox, PrimaryButton, SelectButton } from '../components/ui';

const inBodyReportOptions: Array<{ description: string; label: string; value: boolean }> = [
  {
    description: '검사지 BMR과 체지방률을 참고합니다.',
    label: '인바디 있음',
    value: true,
  },
  {
    description: '신장, 체중, 나이 기준으로 계산합니다.',
    label: '인바디 없음',
    value: false,
  },
];

const sexOptions: Sex[] = ['male', 'female'];
const nutritionGoalOptions: NutritionGoalType[] = ['diet', 'maintain', 'bulk'];
const activityLevelOptions: ActivityLevel[] = [
  'sedentary',
  'light',
  'moderate',
  'veryActive',
];

const goalCalculationModeLabels: Record<GoalCalculationMode, string> = {
  standard: '일반',
  inbody: '인바디',
};

type GoalFormState = {
  hasInBodyReport: boolean;
  ageYears: string;
  sex: Sex;
  heightCm: string;
  weightKg: string;
  goal: NutritionGoalType;
  activityLevel: ActivityLevel;
  inBodyMeasuredAt: string;
  inBodyBmrKcal: string;
  skeletalMuscleMassKg: string;
  bodyFatMassKg: string;
  bodyFatPercentage: string;
  visceralFatLevel: string;
};

type GoalFormChangeHandler = <Field extends keyof GoalFormState>(
  field: Field,
  value: GoalFormState[Field],
) => void;

const DEFAULT_GOAL_FORM: GoalFormState = {
  hasInBodyReport: false,
  ageYears: '30',
  sex: 'male',
  heightCm: '175',
  weightKg: '70',
  goal: 'maintain',
  activityLevel: 'light',
  inBodyMeasuredAt: '',
  inBodyBmrKcal: '',
  skeletalMuscleMassKg: '',
  bodyFatMassKg: '',
  bodyFatPercentage: '',
  visceralFatLevel: '',
};

type TargetScreenProps = {
  currentTargets: DailyNutritionTargets;
  onTargetsChange: (targets: DailyNutritionTargets) => void;
};

export function TargetScreen({
  currentTargets,
  onTargetsChange,
}: TargetScreenProps) {
  const [goalForm, setGoalForm] = useState<GoalFormState>(DEFAULT_GOAL_FORM);
  const goalRecommendation = useMemo(
    () => calculateNutritionGoalRecommendation({
      ageYears: parseNumberInput(goalForm.ageYears),
      sex: goalForm.sex,
      heightCm: parseNumberInput(goalForm.heightCm),
      weightKg: parseNumberInput(goalForm.weightKg),
      goal: goalForm.goal,
      activityLevel: goalForm.activityLevel,
      hasInBodyReport: goalForm.hasInBodyReport,
      inBody: {
        measuredAt: goalForm.inBodyMeasuredAt.trim(),
        bmrKcal: parseOptionalNumberInput(goalForm.inBodyBmrKcal),
        skeletalMuscleMassKg: parseOptionalNumberInput(goalForm.skeletalMuscleMassKg),
        bodyFatMassKg: parseOptionalNumberInput(goalForm.bodyFatMassKg),
        bodyFatPercentage: parseOptionalNumberInput(goalForm.bodyFatPercentage),
        visceralFatLevel: parseOptionalNumberInput(goalForm.visceralFatLevel),
      },
    }),
    [goalForm],
  );

  function updateGoalFormField<Field extends keyof GoalFormState>(
    field: Field,
    value: GoalFormState[Field],
  ) {
    setGoalForm((currentGoalForm) => ({
      ...currentGoalForm,
      [field]: value,
    }));
  }

  const applyRecommendedTargets = () => {
    onTargetsChange(
      applyNutritionGoalRecommendationTargets(currentTargets, goalRecommendation),
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Target</Text>
        <Text style={styles.title}>목표</Text>
        <Text style={styles.dateText}>칼로리와 3대 영양성분 목표 설정</Text>
      </View>

      <GoalRecommendationPanel
        form={goalForm}
        onApplyTargets={applyRecommendedTargets}
        onChangeField={updateGoalFormField}
        recommendation={goalRecommendation}
      />
    </ScrollView>
  );
}

type GoalRecommendationPanelProps = {
  form: GoalFormState;
  onApplyTargets: () => void;
  onChangeField: GoalFormChangeHandler;
  recommendation: NutritionGoalRecommendation;
};

function GoalRecommendationPanel({
  form,
  onApplyTargets,
  onChangeField,
  recommendation,
}: GoalRecommendationPanelProps) {
  return (
    <View style={styles.goalPanel}>
      <Card>
        <View style={styles.summaryHeader}>
          <View>
            <Text style={styles.sectionTitle}>기본 정보</Text>
            <Text style={styles.sectionSubtitle}>목표 계산에 필요한 기본값</Text>
          </View>
        </View>

        <View style={styles.goalFormGrid}>
          <GoalTextInput
            keyboardType="number-pad"
            label="나이"
            onChangeText={(value) => onChangeField('ageYears', value)}
            unit="세"
            value={form.ageYears}
          />
          <GoalTextInput
            keyboardType="decimal-pad"
            label="신장"
            onChangeText={(value) => onChangeField('heightCm', value)}
            unit="cm"
            value={form.heightCm}
          />
          <GoalTextInput
            keyboardType="decimal-pad"
            label="체중"
            onChangeText={(value) => onChangeField('weightKg', value)}
            unit="kg"
            value={form.weightKg}
          />
        </View>

        <View style={styles.goalChoiceSection}>
          <Text style={styles.goalFieldLabel}>성별</Text>
          <View style={styles.segmentedControl}>
            {sexOptions.map((sex) => (
              <SelectButton
                key={sex}
                label={sexLabels[sex]}
                onPress={() => onChangeField('sex', sex)}
                selected={form.sex === sex}
              />
            ))}
          </View>
        </View>

        <View style={styles.goalChoiceSection}>
          <Text style={styles.goalFieldLabel}>목표</Text>
          <View style={styles.segmentedControl}>
            {nutritionGoalOptions.map((goal) => (
              <SelectButton
                key={goal}
                label={nutritionGoalLabels[goal]}
                onPress={() => onChangeField('goal', goal)}
                selected={form.goal === goal}
              />
            ))}
          </View>
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>활동량</Text>
        <Text style={styles.sectionSubtitle}>
          운동 시간이 아니라 평상시 운동 외 직업/생활 활동량 기준입니다.
        </Text>
        <View style={styles.activityList}>
          {activityLevelOptions.map((activityLevel) => (
            <SelectButton
              description={activityLevelDescriptions[activityLevel]}
              key={activityLevel}
              label={activityLevelLabels[activityLevel]}
              onPress={() => onChangeField('activityLevel', activityLevel)}
              selected={form.activityLevel === activityLevel}
            />
          ))}
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>인바디 입력</Text>
        <Text style={styles.sectionSubtitle}>검사지가 있으면 BMR과 체성분을 추천 계산에 반영합니다.</Text>
        <View style={styles.goalQuestionBlock}>
          <Text style={styles.goalQuestionText}>인바디 검사지가 있나요?</Text>
          <View style={styles.segmentedControl}>
            {inBodyReportOptions.map((option) => (
              <SelectButton
                description={option.description}
                key={option.label}
                label={option.label}
                onPress={() => onChangeField('hasInBodyReport', option.value)}
                selected={form.hasInBodyReport === option.value}
              />
            ))}
          </View>
        </View>

        {form.hasInBodyReport ? (
          <View style={styles.inBodySection}>
            <Text style={styles.goalSubsectionTitle}>검사지 수치</Text>
            <View style={styles.goalFormGrid}>
              <GoalTextInput
                label="측정일"
                onChangeText={(value) => onChangeField('inBodyMeasuredAt', value)}
                placeholder="YYYY-MM-DD"
                value={form.inBodyMeasuredAt}
              />
              <GoalTextInput
                keyboardType="decimal-pad"
                label="기초대사량"
                onChangeText={(value) => onChangeField('inBodyBmrKcal', value)}
                unit="kcal"
                value={form.inBodyBmrKcal}
              />
              <GoalTextInput
                keyboardType="decimal-pad"
                label="골격근량"
                onChangeText={(value) => onChangeField('skeletalMuscleMassKg', value)}
                unit="kg"
                value={form.skeletalMuscleMassKg}
              />
              <GoalTextInput
                keyboardType="decimal-pad"
                label="체지방량"
                onChangeText={(value) => onChangeField('bodyFatMassKg', value)}
                unit="kg"
                value={form.bodyFatMassKg}
              />
              <GoalTextInput
                keyboardType="decimal-pad"
                label="체지방률"
                onChangeText={(value) => onChangeField('bodyFatPercentage', value)}
                unit="%"
                value={form.bodyFatPercentage}
              />
              <GoalTextInput
                keyboardType="decimal-pad"
                label="내장지방 레벨"
                onChangeText={(value) => onChangeField('visceralFatLevel', value)}
                value={form.visceralFatLevel}
              />
            </View>
          </View>
        ) : (
          <NoticeBox
            message="인바디 수치 없이 Mifflin-St Jeor 공식과 활동량 계수로 목표를 계산합니다."
            title="일반 계산 모드"
          />
        )}
      </Card>

      <GoalRecommendationResult
        onApplyTargets={onApplyTargets}
        recommendation={recommendation}
      />
    </View>
  );
}

type GoalTextInputProps = {
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad';
  label: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  unit?: string;
  value: string;
};

function GoalTextInput({
  keyboardType = 'default',
  label,
  onChangeText,
  placeholder,
  unit,
  value,
}: GoalTextInputProps) {
  return (
    <View style={styles.goalInputGroup}>
      <Text style={styles.goalFieldLabel}>{label}</Text>
      <View style={styles.goalInputRow}>
        <TextInput
          keyboardType={keyboardType}
          onChangeText={onChangeText}
          placeholder={placeholder ?? label}
          placeholderTextColor={colors.textSoft}
          style={styles.goalTextInput}
          value={value}
        />
        {unit ? <Text style={styles.goalUnitText}>{unit}</Text> : null}
      </View>
    </View>
  );
}

type GoalRecommendationResultProps = {
  onApplyTargets: () => void;
  recommendation: NutritionGoalRecommendation;
};

function GoalRecommendationResult({
  onApplyTargets,
  recommendation,
}: GoalRecommendationResultProps) {
  if (!recommendation.ok) {
    return (
      <Card>
        <Text style={styles.sectionTitle}>추천 결과</Text>
        <View style={styles.goalResultSection}>
          {recommendation.errors.map((error) => (
            <NoticeBox
              key={error.code}
              message={error.message}
              title="입력 오류"
              variant="danger"
            />
          ))}
          <Text style={styles.goalDisclaimerText}>
            인바디 결과와 계산 결과는 의료 진단이 아니라 참고용 추천입니다.
          </Text>
        </View>
      </Card>
    );
  }

  const resultRows: Array<{ label: string; value: string }> = [
    { label: '계산 모드', value: goalCalculationModeLabels[recommendation.mode] },
    { label: '선택된 BMR', value: formatKcalValue(recommendation.selectedBmrKcal) },
    { label: 'Mifflin BMR', value: formatKcalValue(recommendation.mifflinBmrKcal) },
    { label: 'TDEE', value: formatKcalValue(recommendation.tdeeKcal) },
    { label: 'BMI', value: formatBmiValue(recommendation.bmi) },
    { label: 'BMI 분류', value: bmiCategoryLabels[recommendation.bmiCategory] },
    { label: '목표 칼로리', value: formatKcalValue(recommendation.targets.caloriesKcal ?? 0) },
    { label: '목표 단백질', value: formatGramValue(recommendation.targets.proteinG ?? 0) },
    { label: '목표 탄수화물', value: formatGramValue(recommendation.targets.carbohydrateG ?? 0) },
    { label: '목표 지방', value: formatGramValue(recommendation.targets.fatG ?? 0) },
  ];

  if (recommendation.inBodyBmrKcal !== null) {
    resultRows.splice(3, 0, {
      label: '인바디 BMR',
      value: formatKcalValue(recommendation.inBodyBmrKcal),
    });
  }

  return (
    <Card>
      <View style={styles.summaryHeader}>
        <View>
          <Text style={styles.sectionTitle}>추천 결과</Text>
          <Text style={styles.sectionSubtitle}>BMR, TDEE와 목표 영양성분</Text>
        </View>
      </View>
      <View style={styles.goalResultSection}>
        <View style={styles.goalResultGrid}>
          {resultRows.map((row) => (
            <View key={row.label} style={styles.goalResultItem}>
              <Text style={styles.goalResultLabel}>{row.label}</Text>
              <Text style={styles.goalResultValue}>{row.value}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.goalDisclaimerText}>
          인바디 결과와 계산 결과는 의료 진단이 아니라 참고용 추천입니다.
        </Text>

        <View style={styles.goalWarningList}>
          <Text style={styles.goalResultTitle}>주의 사항</Text>
          {recommendation.warnings.length > 0 ? (
            recommendation.warnings.map((warning) => (
              <NoticeBox
                key={warning.code}
                message={warning.message}
                title="주의"
                variant="warning"
              />
            ))
          ) : (
            <NoticeBox message="현재 표시할 주의 사항이 없습니다." title="안내" />
          )}
        </View>

        <PrimaryButton
          label="목표 적용"
          onPress={onApplyTargets}
          style={styles.applyGoalButton}
          textStyle={styles.applyGoalButtonText}
        />
      </View>
    </Card>
  );
}
