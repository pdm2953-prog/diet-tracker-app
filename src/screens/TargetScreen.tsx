import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import {
  Card,
  NoticeBox,
  PrimaryButton,
  SectionHeader,
  SelectButton,
  StatusBadge,
} from '../components/ui';
import { colors } from '../constants';
import type { DailyNutritionTargets, PrimaryNutritionField } from '../nutrition';
import { nutritionLabels } from '../nutrition';
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
const goalMacroFields: PrimaryNutritionField[] = ['proteinG', 'carbohydrateG', 'fatG'];

const goalCalculationModeLabels: Record<GoalCalculationMode, string> = {
  standard: '일반',
  inbody: '인바디',
};

const nutritionGoalDescriptions: Record<NutritionGoalType, string> = {
  diet: '유지 칼로리보다 낮게 잡고 단백질을 높입니다.',
  maintain: '현재 체중 유지를 기준으로 균형 있게 배분합니다.',
  bulk: '유지 칼로리보다 높게 잡고 증량을 지원합니다.',
};

const goalMacroDescriptions: Record<PrimaryNutritionField, string> = {
  caloriesKcal: '하루 목표 에너지',
  proteinG: '체중 기반 권장량',
  carbohydrateG: '남은 에너지 배분',
  fatG: '목표 칼로리의 25%',
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
  currentGoalType: NutritionGoalType;
  currentTargets: DailyNutritionTargets;
  onTargetsChange: (targets: DailyNutritionTargets, goalType: NutritionGoalType) => void;
};

export function TargetScreen({
  currentGoalType,
  currentTargets,
  onTargetsChange,
}: TargetScreenProps) {
  const [goalForm, setGoalForm] = useState<GoalFormState>(() => ({
    ...DEFAULT_GOAL_FORM,
    goal: currentGoalType,
  }));
  useEffect(() => {
    setGoalForm((currentGoalForm) => ({
      ...currentGoalForm,
      goal: currentGoalType,
    }));
  }, [currentGoalType]);

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
      goalForm.goal,
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
      <Card style={styles.goalSectionCard}>
        <SectionHeader
          eyebrow="01"
          subtitle="추천 계산의 기준이 되는 신체 정보입니다."
          title="기본 정보"
        />

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
                accessibilityLabel={`성별 ${sexLabels[sex]} 선택`}
                key={sex}
                label={sexLabels[sex]}
                onPress={() => onChangeField('sex', sex)}
                selected={form.sex === sex}
              />
            ))}
          </View>
        </View>
      </Card>

      <Card style={styles.goalSectionCard}>
        <SectionHeader
          eyebrow="02"
          subtitle="목표 방향과 평소 생활 활동량을 함께 반영합니다."
          title="활동량과 목표"
        />

        <View style={styles.goalChoiceSection}>
          <Text style={styles.goalFieldLabel}>목표</Text>
          <View style={styles.segmentedControl}>
            {nutritionGoalOptions.map((goal) => (
              <SelectButton
                accessibilityLabel={`목표 ${nutritionGoalLabels[goal]} 선택`}
                description={nutritionGoalDescriptions[goal]}
                key={goal}
                label={nutritionGoalLabels[goal]}
                onPress={() => onChangeField('goal', goal)}
                selected={form.goal === goal}
              />
            ))}
          </View>
        </View>

        <View style={styles.goalChoiceSection}>
          <Text style={styles.goalFieldLabel}>활동량</Text>
          <Text style={styles.goalHelpText}>
            운동 시간이 아니라 평상시 운동 외 직업/생활 활동량 기준입니다.
          </Text>
          <View style={styles.activityList}>
            {activityLevelOptions.map((activityLevel) => (
              <SelectButton
                accessibilityLabel={`활동량 ${activityLevelLabels[activityLevel]} 선택`}
                description={activityLevelDescriptions[activityLevel]}
                key={activityLevel}
                label={activityLevelLabels[activityLevel]}
                onPress={() => onChangeField('activityLevel', activityLevel)}
                selected={form.activityLevel === activityLevel}
              />
            ))}
          </View>
        </View>
      </Card>

      <Card style={styles.goalSectionCard}>
        <SectionHeader
          action={(
            <StatusBadge
              label={form.hasInBodyReport ? '인바디 사용' : '일반 계산'}
              tone={form.hasInBodyReport ? 'info' : 'neutral'}
            />
          )}
          eyebrow="03"
          subtitle="검사지가 있으면 BMR과 체성분을 추천 계산에 반영합니다."
          title="인바디"
        />

        <View style={styles.goalQuestionBlock}>
          <Text style={styles.goalQuestionText}>인바디 검사지가 있나요?</Text>
          <View style={styles.segmentedControl}>
            {inBodyReportOptions.map((option) => (
              <SelectButton
                accessibilityLabel={`${option.label} 선택`}
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
        goal={form.goal}
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
          accessibilityLabel={`${label}${unit ? ` ${unit}` : ''} 입력`}
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
  goal: NutritionGoalType;
  onApplyTargets: () => void;
  recommendation: NutritionGoalRecommendation;
};

function GoalRecommendationResult({
  goal,
  onApplyTargets,
  recommendation,
}: GoalRecommendationResultProps) {
  if (!recommendation.ok) {
    return (
      <Card style={styles.goalResultCard}>
        <SectionHeader
          eyebrow="04"
          subtitle="입력값을 확인하면 추천 목표가 표시됩니다."
          title="추천 결과"
        />
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

  return (
    <Card elevated style={styles.goalResultCard}>
      <SectionHeader
        action={<StatusBadge label={goalCalculationModeLabels[recommendation.mode]} tone="info" />}
        eyebrow="04"
        subtitle="추천 목표와 계산 기준을 확인한 뒤 적용합니다."
        title="추천 결과"
      />

      <View style={styles.goalResultSection}>
        <View style={styles.goalCalorieHero}>
          <Text style={styles.goalCalorieLabel}>추천 칼로리</Text>
          <Text style={styles.goalCalorieValue}>
            {formatKcalValue(recommendation.targets.caloriesKcal ?? 0)}
          </Text>
          <Text style={styles.goalCalorieMeta}>
            {nutritionGoalLabels[goal]} 목표 기준
          </Text>
        </View>

        <View style={styles.goalMacroGrid}>
          {goalMacroFields.map((field) => (
            <View key={field} style={styles.goalMacroItem}>
              <Text style={styles.goalMacroLabel}>{nutritionLabels[field]}</Text>
              <Text style={styles.goalMacroValue}>
                {formatGramValue(recommendation.targets[field] ?? 0)}
              </Text>
              <Text style={styles.goalMacroMeta}>{goalMacroDescriptions[field]}</Text>
            </View>
          ))}
        </View>

        <View style={styles.goalMetabolismGrid}>
          <GoalMetricCard
            description="추천 계산에 실제 사용한 기초대사량입니다."
            label="선택된 BMR"
            value={formatKcalValue(recommendation.selectedBmrKcal)}
          />
          <GoalMetricCard
            description="신장, 체중, 나이, 성별로 추정한 기초대사량입니다."
            label="Mifflin BMR"
            value={formatKcalValue(recommendation.mifflinBmrKcal)}
          />
          {recommendation.inBodyBmrKcal !== null ? (
            <GoalMetricCard
              description="인바디 검사지에 기록된 기초대사량입니다."
              label="인바디 BMR"
              value={formatKcalValue(recommendation.inBodyBmrKcal)}
            />
          ) : null}
          <GoalMetricCard
            description="BMR에 생활 활동량을 반영한 하루 예상 소비 칼로리입니다."
            label="TDEE"
            value={formatKcalValue(recommendation.tdeeKcal)}
          />
          <GoalMetricCard
            description={bmiCategoryLabels[recommendation.bmiCategory]}
            label="BMI"
            value={formatBmiValue(recommendation.bmi)}
          />
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
          accessibilityLabel="추천 목표 적용"
          label="추천 목표 적용"
          onPress={onApplyTargets}
          style={styles.applyGoalButton}
          textStyle={styles.applyGoalButtonText}
        />
      </View>
    </Card>
  );
}

type GoalMetricCardProps = {
  description: string;
  label: string;
  value: string;
};

function GoalMetricCard({ description, label, value }: GoalMetricCardProps) {
  return (
    <View style={styles.goalMetricCard}>
      <Text style={styles.goalMetricLabel}>{label}</Text>
      <Text style={styles.goalMetricValue}>{value}</Text>
      <Text style={styles.goalMetricDescription}>{description}</Text>
    </View>
  );
}
