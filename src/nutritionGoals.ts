import type { DailyNutritionTargets } from './nutrition';

export type GoalCalculationMode = 'standard' | 'inbody';
export type Sex = 'male' | 'female';
export type NutritionGoalType = 'diet' | 'maintain' | 'bulk';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'veryActive';
export type BmiCategory = 'underweight' | 'normal' | 'overweight' | 'obese';

export type InBodyGoalInput = {
  measuredAt: string;
  bmrKcal: number | null;
  skeletalMuscleMassKg: number | null;
  bodyFatMassKg: number | null;
  bodyFatPercentage: number | null;
  visceralFatLevel: number | null;
};

export type NutritionGoalInput = {
  ageYears: number;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  goal: NutritionGoalType;
  activityLevel: ActivityLevel;
  hasInBodyReport: boolean;
  inBody?: InBodyGoalInput;
};

export type NutritionGoalWarningCode =
  | 'bmrMismatch'
  | 'negativeCarbsClamped'
  | 'underweightDiet'
  | 'obeseBulk'
  | 'lowBodyFatDiet'
  | 'highBodyFatBulk';

export type NutritionGoalErrorCode =
  | 'invalidAge'
  | 'invalidHeight'
  | 'invalidWeight';

export type NutritionGoalWarning = {
  code: NutritionGoalWarningCode;
  message: string;
};

export type NutritionGoalError = {
  code: NutritionGoalErrorCode;
  message: string;
};

export type NutritionGoalRecommendation =
  | {
      ok: true;
      mode: GoalCalculationMode;
      selectedBmrKcal: number;
      mifflinBmrKcal: number;
      inBodyBmrKcal: number | null;
      tdeeKcal: number;
      bmi: number;
      bmiCategory: BmiCategory;
      targets: DailyNutritionTargets;
      warnings: NutritionGoalWarning[];
    }
  | {
      ok: false;
      errors: NutritionGoalError[];
      warnings: NutritionGoalWarning[];
    };

export const sexLabels: Record<Sex, string> = {
  male: '남성',
  female: '여성',
};

export const nutritionGoalLabels: Record<NutritionGoalType, string> = {
  diet: '다이어트',
  maintain: '건강유지',
  bulk: '벌크업',
};

export const activityLevelLabels: Record<ActivityLevel, string> = {
  sedentary: '앉아서 활동함',
  light: '조금 걸음',
  moderate: '꽤나 걸음',
  veryActive: '과한 활동량',
};

export const activityLevelDescriptions: Record<ActivityLevel, string> = {
  sedentary: '사무직, 개발자 등 대부분 앉아서 생활',
  light: '대학생 등 이동은 하지만 앉아서 활동하는 시간이 많음',
  moderate: '영업직, 기타 아르바이트 등 이동과 서 있는 시간이 많은 경우',
  veryActive: '노가다, 운동 코치 등 활동량이 높은 직업',
};

export const bmiCategoryLabels: Record<BmiCategory, string> = {
  underweight: '저체중',
  normal: '정상',
  overweight: '과체중',
  obese: '비만',
};

export const activityFactors: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.35,
  moderate: 1.5,
  veryActive: 1.7,
};

const calorieGoalFactors: Record<NutritionGoalType, number> = {
  diet: 0.85,
  maintain: 1,
  bulk: 1.1,
};

const proteinFactorsPerKg: Record<NutritionGoalType, number> = {
  diet: 1.8,
  maintain: 1.4,
  bulk: 1.8,
};

const LOW_BODY_FAT_PERCENTAGE: Record<Sex, number> = {
  male: 10,
  female: 18,
};

const HIGH_BODY_FAT_PERCENTAGE: Record<Sex, number> = {
  male: 25,
  female: 32,
};

const BMR_MISMATCH_THRESHOLD_RATIO = 0.15;

export function calculateMifflinBmr(
  sex: Sex,
  weightKg: number,
  heightCm: number,
  ageYears: number,
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;

  return sex === 'male' ? base + 5 : base - 161;
}

export function calculateBmi(weightKg: number, heightCm: number): number {
  return weightKg / ((heightCm / 100) ** 2);
}

export function classifyBmi(bmi: number): BmiCategory {
  if (bmi < 18.5) {
    return 'underweight';
  }

  if (bmi < 25) {
    return 'normal';
  }

  if (bmi < 30) {
    return 'overweight';
  }

  return 'obese';
}

export function calculateNutritionGoalRecommendation(
  input: NutritionGoalInput,
): NutritionGoalRecommendation {
  const errors = validateGoalInput(input);

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      warnings: [],
    };
  }

  const warnings: NutritionGoalWarning[] = [];
  const mode: GoalCalculationMode = input.hasInBodyReport ? 'inbody' : 'standard';
  const mifflinBmrKcal = calculateMifflinBmr(
    input.sex,
    input.weightKg,
    input.heightCm,
    input.ageYears,
  );
  const validInBodyBmr = getValidPositiveNumber(input.inBody?.bmrKcal);
  let selectedBmrKcal = mifflinBmrKcal;

  if (mode === 'inbody' && validInBodyBmr !== null) {
    const mismatchRatio = Math.abs(validInBodyBmr - mifflinBmrKcal) / Math.abs(mifflinBmrKcal);

    if (mismatchRatio > BMR_MISMATCH_THRESHOLD_RATIO) {
      selectedBmrKcal = (validInBodyBmr + mifflinBmrKcal) / 2;
      warnings.push({
        code: 'bmrMismatch',
        message: '인바디 BMR과 Mifflin-St Jeor BMR 차이가 15%를 초과해 두 값의 평균을 사용했습니다.',
      });
    } else {
      selectedBmrKcal = validInBodyBmr;
    }
  }

  const tdeeKcal = selectedBmrKcal * activityFactors[input.activityLevel];
  const targetCalories = tdeeKcal * calorieGoalFactors[input.goal];
  const proteinG = input.weightKg * proteinFactorsPerKg[input.goal];
  const fatG = targetCalories * 0.25 / 9;
  const rawCarbohydrateG = (targetCalories - proteinG * 4 - fatG * 9) / 4;
  const carbohydrateG = rawCarbohydrateG < 0 ? 0 : rawCarbohydrateG;

  if (rawCarbohydrateG < 0) {
    warnings.push({
      code: 'negativeCarbsClamped',
      message: '목표 칼로리에서 단백질과 지방을 제외한 탄수화물이 음수라 0g으로 보정했습니다.',
    });
  }

  const bmi = calculateBmi(input.weightKg, input.heightCm);
  const bmiCategory = classifyBmi(bmi);

  if (bmiCategory === 'underweight' && input.goal === 'diet') {
    warnings.push({
      code: 'underweightDiet',
      message: 'BMI가 저체중 범위인데 다이어트 목표입니다. 감량 목표는 전문가와 상담을 권장합니다.',
    });
  }

  if (bmiCategory === 'obese' && input.goal === 'bulk') {
    warnings.push({
      code: 'obeseBulk',
      message: 'BMI가 비만 범위인데 벌크업 목표입니다. 증량 목표는 신중히 검토하세요.',
    });
  }

  const bodyFatPercentage = getValidPositiveNumber(input.inBody?.bodyFatPercentage);

  if (mode === 'inbody' && bodyFatPercentage !== null) {
    if (
      input.goal === 'diet'
      && bodyFatPercentage < LOW_BODY_FAT_PERCENTAGE[input.sex]
    ) {
      warnings.push({
        code: 'lowBodyFatDiet',
        message: '체지방률이 낮은 편인데 다이어트 목표입니다. 감량 목표는 신중히 검토하세요.',
      });
    }

    if (
      input.goal === 'bulk'
      && bodyFatPercentage > HIGH_BODY_FAT_PERCENTAGE[input.sex]
    ) {
      warnings.push({
        code: 'highBodyFatBulk',
        message: '체지방률이 높은 편인데 벌크업 목표입니다. 증량 목표는 신중히 검토하세요.',
      });
    }
  }

  return {
    ok: true,
    mode,
    selectedBmrKcal,
    mifflinBmrKcal,
    inBodyBmrKcal: mode === 'inbody' ? validInBodyBmr : null,
    tdeeKcal,
    bmi,
    bmiCategory,
    targets: {
      caloriesKcal: targetCalories,
      proteinG,
      carbohydrateG,
      fatG,
    },
    warnings,
  };
}

export function applyNutritionGoalRecommendationTargets(
  currentTargets: DailyNutritionTargets,
  recommendation: NutritionGoalRecommendation,
): DailyNutritionTargets {
  if (!recommendation.ok) {
    return currentTargets;
  }

  return {
    caloriesKcal: recommendation.targets.caloriesKcal,
    proteinG: recommendation.targets.proteinG,
    carbohydrateG: recommendation.targets.carbohydrateG,
    fatG: recommendation.targets.fatG,
  };
}

function validateGoalInput(input: NutritionGoalInput): NutritionGoalError[] {
  const errors: NutritionGoalError[] = [];

  if (!Number.isFinite(input.ageYears) || input.ageYears <= 0) {
    errors.push({
      code: 'invalidAge',
      message: '나이는 0보다 큰 숫자로 입력해주세요.',
    });
  }

  if (!Number.isFinite(input.heightCm) || input.heightCm <= 0) {
    errors.push({
      code: 'invalidHeight',
      message: '신장은 0보다 큰 cm 숫자로 입력해주세요.',
    });
  }

  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) {
    errors.push({
      code: 'invalidWeight',
      message: '체중은 0보다 큰 kg 숫자로 입력해주세요.',
    });
  }

  return errors;
}

function getValidPositiveNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}
