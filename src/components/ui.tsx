import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Pressable, Text, View } from 'react-native';

import { styles } from '../styles';

type AppCardProps = {
  children: ReactNode;
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'hero' | 'modal';
};

export function AppCard({
  children,
  elevated = false,
  style,
  variant = 'default',
}: AppCardProps) {
  return (
    <View
      style={[
        styles.card,
        variant === 'hero' ? styles.cardHero : null,
        variant === 'modal' ? styles.cardModal : null,
        elevated ? styles.cardElevated : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Card(props: AppCardProps) {
  return <AppCard {...props} />;
}

type SectionHeaderProps = {
  action?: ReactNode;
  eyebrow?: string;
  subtitle?: string;
  title: string;
};

export function SectionHeader({ action, eyebrow, subtitle, title }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeaderRow}>
      <View style={styles.sectionHeaderTextBlock}>
        {eyebrow ? <Text style={styles.sectionEyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {action ? <View style={styles.sectionHeaderAction}>{action}</View> : null}
    </View>
  );
}

export type StatusBadgeTone = 'danger' | 'info' | 'neutral' | 'scheduled' | 'success' | 'warning';

type StatusBadgeProps = {
  icon?: string;
  label: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  tone?: StatusBadgeTone;
};

const statusBadgeIcons: Record<StatusBadgeTone, string> = {
  danger: '!',
  info: 'i',
  neutral: '-',
  scheduled: '•',
  success: '✓',
  warning: '!',
};

export function StatusBadge({
  icon,
  label,
  style,
  textStyle,
  tone = 'neutral',
}: StatusBadgeProps) {
  return (
    <View
      accessibilityLabel={`${label} 상태`}
      accessible
      style={[styles.statusBadge, getStatusBadgeStyle(tone), style]}
    >
      <Text style={[styles.statusBadgeIcon, getStatusBadgeTextStyle(tone)]}>
        {icon ?? statusBadgeIcons[tone]}
      </Text>
      <Text style={[styles.statusBadgeText, getStatusBadgeTextStyle(tone), textStyle]}>
        {label}
      </Text>
    </View>
  );
}

function getStatusBadgeStyle(tone: StatusBadgeTone): StyleProp<ViewStyle> {
  if (tone === 'success') {
    return styles.statusBadgeSuccess;
  }

  if (tone === 'warning') {
    return styles.statusBadgeWarning;
  }

  if (tone === 'danger') {
    return styles.statusBadgeDanger;
  }

  if (tone === 'scheduled') {
    return styles.statusBadgeScheduled;
  }

  if (tone === 'info') {
    return styles.statusBadgeInfo;
  }

  return styles.statusBadgeNeutral;
}

function getStatusBadgeTextStyle(tone: StatusBadgeTone): StyleProp<TextStyle> {
  if (tone === 'success') {
    return styles.statusBadgeTextSuccess;
  }

  if (tone === 'warning') {
    return styles.statusBadgeTextWarning;
  }

  if (tone === 'danger') {
    return styles.statusBadgeTextDanger;
  }

  if (tone === 'scheduled') {
    return styles.statusBadgeTextScheduled;
  }

  if (tone === 'info') {
    return styles.statusBadgeTextInfo;
  }

  return styles.statusBadgeTextNeutral;
}

type ButtonProps = {
  accessibilityLabel?: string;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function PrimaryButton({
  accessibilityLabel,
  disabled = false,
  label,
  onPress,
  style,
  textStyle,
}: ButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        style,
        disabled ? styles.buttonDisabled : null,
        pressed && !disabled ? styles.buttonPressed : null,
      ]}
    >
      <Text
        style={[
          styles.primaryButtonText,
          textStyle,
          disabled ? styles.buttonDisabledText : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function SecondaryButton({
  accessibilityLabel,
  disabled = false,
  label,
  onPress,
  style,
  textStyle,
}: ButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        style,
        disabled ? styles.buttonDisabled : null,
        pressed && !disabled ? styles.buttonPressed : null,
      ]}
    >
      <Text
        style={[
          styles.secondaryButtonText,
          textStyle,
          disabled ? styles.buttonDisabledText : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

type IconButtonProps = {
  accessibilityLabel: string;
  disabled?: boolean;
  icon: string;
  label?: string;
  onPress: () => void;
  selected?: boolean;
  size?: 'medium' | 'small';
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  tone?: 'danger' | 'neutral' | 'primary';
};

export function IconButton({
  accessibilityLabel,
  disabled = false,
  icon,
  label,
  onPress,
  selected = false,
  size = 'medium',
  style,
  textStyle,
  tone = 'neutral',
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        size === 'small' ? styles.iconButtonSmall : null,
        tone === 'primary' ? styles.iconButtonPrimary : null,
        tone === 'danger' ? styles.iconButtonDanger : null,
        selected ? styles.iconButtonSelected : null,
        disabled ? styles.buttonDisabled : null,
        pressed && !disabled ? styles.buttonPressed : null,
        style,
      ]}
    >
      <Text
        style={[
          styles.iconButtonText,
          tone === 'primary' || selected ? styles.iconButtonTextPrimary : null,
          tone === 'danger' ? styles.iconButtonTextDanger : null,
          textStyle,
          disabled ? styles.buttonDisabledText : null,
        ]}
      >
        {icon}
      </Text>
      {label ? (
        <Text
          style={[
            styles.iconButtonLabel,
            tone === 'primary' || selected ? styles.iconButtonLabelPrimary : null,
            tone === 'danger' ? styles.iconButtonLabelDanger : null,
            textStyle,
          ]}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

type BottomTabItemProps = {
  icon: string;
  label: string;
  onPress: () => void;
  selected: boolean;
  style?: StyleProp<ViewStyle>;
};

export function BottomTabItem({ icon, label, onPress, selected, style }: BottomTabItemProps) {
  return (
    <Pressable
      accessibilityLabel={`${label} 탭`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tabButton,
        selected ? styles.tabButtonActive : null,
        pressed ? styles.tabButtonPressed : null,
        style,
      ]}
    >
      <View style={[styles.tabIndicator, selected ? styles.tabIndicatorActive : null]} />
      <Text style={[styles.tabIconText, selected ? styles.tabButtonTextActive : null]}>
        {icon}
      </Text>
      <Text style={[styles.tabButtonText, selected ? styles.tabButtonTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

type SelectButtonProps = {
  accessibilityLabel?: string;
  description?: string;
  label: string;
  onPress: () => void;
  selected: boolean;
  style?: StyleProp<ViewStyle>;
};

export function SelectButton({
  accessibilityLabel,
  description,
  label,
  onPress,
  selected,
  style,
}: SelectButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.selectButton,
        description ? styles.selectButtonWithDescription : null,
        selected ? styles.selectButtonActive : null,
        pressed ? styles.buttonPressed : null,
        style,
      ]}
    >
      <Text style={[styles.selectButtonText, selected ? styles.selectButtonTextActive : null]}>
        {label}
      </Text>
      {description ? (
        <Text
          style={[
            styles.selectButtonDescription,
            selected ? styles.selectButtonDescriptionActive : null,
          ]}
        >
          {description}
        </Text>
      ) : null}
    </Pressable>
  );
}

type MacroProgressRowProps = {
  label: string;
  meta: string;
  progress: number;
  tone?: 'calories' | 'carbohydrate' | 'fat' | 'protein';
  value: string;
  warning?: string;
};

export function MacroProgressRow({
  label,
  meta,
  progress,
  tone = 'protein',
  value,
  warning,
}: MacroProgressRowProps) {
  const safeProgress = Number.isFinite(progress) ? Math.min(Math.max(progress, 0), 1) : 0;
  const progressWidth = `${Math.round(safeProgress * 100)}%` as `${number}%`;

  return (
    <View style={styles.metricBlock}>
      <View style={styles.metricTopRow}>
        <Text style={styles.metricName}>{label}</Text>
        <Text style={styles.metricValue}>{value}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            getMacroProgressFillStyle(tone),
            { width: progressWidth },
          ]}
        />
      </View>
      <View style={styles.metricMetaRow}>
        <Text style={styles.metricMetaText}>{meta}</Text>
        {warning ? <Text style={styles.metricWarningText}>{warning}</Text> : null}
      </View>
    </View>
  );
}

function getMacroProgressFillStyle(tone: NonNullable<MacroProgressRowProps['tone']>) {
  if (tone === 'calories') {
    return styles.progressFillCalories;
  }

  if (tone === 'carbohydrate') {
    return styles.progressFillCarbohydrate;
  }

  if (tone === 'fat') {
    return styles.progressFillFat;
  }

  return styles.progressFillProtein;
}

type EmptyStateProps = {
  action?: ReactNode;
  icon?: string;
  message?: string;
  title: string;
};

export function EmptyState({ action, icon = '•', message, title }: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateIcon}>{icon}</Text>
      <Text style={styles.emptyStateTitle}>{title}</Text>
      {message ? <Text style={styles.emptyStateMessage}>{message}</Text> : null}
      {action ? <View style={styles.emptyStateAction}>{action}</View> : null}
    </View>
  );
}

type NoticeBoxProps = {
  children?: ReactNode;
  message?: string;
  title?: string;
  variant?: 'info' | 'warning' | 'danger';
};

export function NoticeBox({
  children,
  message,
  title,
  variant = 'info',
}: NoticeBoxProps) {
  return (
    <View
      style={[
        styles.noticeBox,
        variant === 'warning' ? styles.noticeBoxWarning : null,
        variant === 'danger' ? styles.noticeBoxDanger : null,
      ]}
    >
      {title ? <Text style={styles.noticeTitle}>{title}</Text> : null}
      {message ? <Text style={styles.noticeText}>{message}</Text> : null}
      {children}
    </View>
  );
}

export function WarningBox(props: Omit<NoticeBoxProps, 'variant'>) {
  return <NoticeBox {...props} variant="warning" />;
}

type StatRowProps = {
  label: string;
  value: string;
};

export function StatRow({ label, value }: StatRowProps) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statRowLabel}>{label}</Text>
      <Text style={styles.statRowValue}>{value}</Text>
    </View>
  );
}
