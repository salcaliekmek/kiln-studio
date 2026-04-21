import React from 'react';
import { Badge } from './Badge';
import { Colors } from '../constants/theme';
import { ProductionStage } from '../types';

const STAGE_LABELS: Record<ProductionStage, string> = {
  casting: 'Döküm',
  drying: 'Kurutma',
  bisque: 'Bisküvi Bekleniyor',
  bisque_done: 'Bisküvi Tamamlandı',
  glazing: 'Sırlama',
  glaze_firing: 'Sır Pişirim Bekleniyor',
  glaze_done: 'Sır Tamamlandı',
  decal: 'Dekal Baskı',
  decal_firing: 'Dekal Pişirim Bekleniyor',
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
