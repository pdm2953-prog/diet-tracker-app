import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Pressable, Text, View } from 'react-native';

import { styles } from '../styles';

type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, style }: CardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
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

type SelectButtonProps = {
  description?: string;
  label: string;
  onPress: () => void;
  selected: boolean;
  style?: StyleProp<ViewStyle>;
};

export function SelectButton({
  description,
  label,
  onPress,
  selected,
  style,
}: SelectButtonProps) {
  return (
    <Pressable
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
  value: string;
  warning?: string;
};

export function MacroProgressRow({
  label,
  meta,
  progress,
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
        <View style={[styles.progressFill, { width: progressWidth }]} />
      </View>
      <View style={styles.metricMetaRow}>
        <Text style={styles.metricMetaText}>{meta}</Text>
        {warning ? <Text style={styles.metricWarningText}>{warning}</Text> : null}
      </View>
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


