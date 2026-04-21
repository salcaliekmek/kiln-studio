import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, BorderRadius, Typography } from '../constants/theme';

interface BadgeProps {
  label: string;
  color?: string;
  style?: ViewStyle;
  size?: 'sm' | 'md';
}

export function Badge({ label, color = Colors.accent, style, size = 'md' }: BadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: color + '25' }, size === 'sm' && styles.small, style]}>
      <Text style={[styles.text, { color }, size === 'sm' && styles.smallText]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
  },
  text: {
    ...Typography.caption,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  small: {
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  smallText: {
    fontSize: 10,
  },
});
