import React from 'react';
import { Badge } from './Badge';
import { Colors } from '../constants/theme';
import { ProductionStage } from '../types';

const STAGE_LABELS: Record<ProductionStage, string> = {
  casting: 'Döküm',
  drying: 'Kurutma',
  bisque: 'Bisküvi Pişirim Fırını',
  bisque_done: 'Zımparalama',
  glazing: 'Sırlama',
  glaze_firing: 'Sır Pişirim Fırını',
  glaze_done: 'Sır Hazır',
  decal: 'Dekal Baskı',
  decal_firing: 'Dekal Fırını',
  sanding: 'Son Zımparalama',
  finished: 'Satışa Hazır',
};

interface StageBadgeProps {
  stage: ProductionStage;
  size?: 'sm' | 'md';
}

export function StageBadge({ stage, size }: StageBadgeProps) {
  const color = Colors.stages[stage];
  return <Badge label={STAGE_LABELS[stage]} color={color} size={size} />;
}

export { STAGE_LABELS };
