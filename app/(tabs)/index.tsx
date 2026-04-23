import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Colors, Spacing, Typography, BorderRadius } from '../../src/constants/theme';
import { Card } from '../../src/components/Card';
import { getMaterials, getMaterialsWithLowStock } from '../../src/services/materials';
import { getActiveProductionItems } from '../../src/services/production';
import { getUpcomingFirings } from '../../src/services/kiln';
import { getTotalFinishedStock, getStockValue } from '../../src/services/stock';
import { getProfile } from '../../src/services/settings';
import { ProductionStage } from '../../src/types';

interface MetricRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  color: string;
  onPress?: () => void;
  alert?: boolean;
  last?: boolean;
}

function MetricRow({ icon, label, value, color, onPress, alert, last }: MetricRowProps) {
  return (
    <TouchableOpacity
      style={[styles.metricRow, !last && styles.metricRowBorder]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={[styles.metricIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={18} color={color} />
        {alert && <View style={styles.alertDot} />}
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

const ALL_STAGES: ProductionStage[] = [
  'casting', 'drying', 'bisque', 'bisque_done',
  'glazing', 'glaze_firing',
  'decal', 'decal_firing', 'sanding', 'finished',
];

const STAGE_PROCESS_INFO: Partial<Record<ProductionStage, { title: string; desc: string }>> = {
  casting: { title: 'Döküm', desc: 'Sıvı çamur alçı kalıba dökülür' },
  drying: { title: 'Kurutma', desc: 'Ürün kalıptan çıkarılıp kurumaya bırakılır' },
  bisque: { title: 'Bisküvi Pişirimi', desc: '1. pişirim – bisküvi oluşur' },
  bisque_done: { title: 'Bisküvi Bitti', desc: 'Zımparalama' },
  glazing: { title: 'Sırlama', desc: 'Düzeltme, iç sırlama' },
  glaze_firing: { title: 'Ana Pişirim', desc: '2. pişirim – sır işlenir' },
  decal: { title: 'Dekal', desc: 'Logo baskısı' },
  decal_firing: { title: 'Dekal Pişirimi', desc: 'Düşük derecede pişirim' },
  sanding: { title: 'Son Zımparalama', desc: 'Son kontrol' },
  finished: { title: 'Satışa Hazır', desc: 'Tamamlandı' },
};

export default function DashboardScreen() {
  const [lowStockCount, setLowStockCount] = useState(0);
  const [activeItems, setActiveItems] = useState(0);
  const [stageCounts, setStageCounts] = useState<Partial<Record<ProductionStage, number>>>({});
  const [upcomingFirings, setUpcomingFirings] = useState(0);
  const [finishedStock, setFinishedStock] = useState(0);
  const [stockValue, setStockValue] = useState(0);
  const [studioName, setStudioName] = useState('Onni Studio');
  const [ownerName, setOwnerName] = useState('');
  const [activeStages, setActiveStages] = useState<ProductionStage[]>([...ALL_STAGES]);

  const loadStats = useCallback(async () => {
    try {
      const [lowStock, active, firings, finished, value, profile] = await Promise.all([
        getMaterialsWithLowStock(),
        getActiveProductionItems(),
        getUpcomingFirings(),
        getTotalFinishedStock(),
        getStockValue(),
        getProfile(),
      ]);
      // Aşama bazında toplam adet sayısı
      const counts: Partial<Record<ProductionStage, number>> = {};
      for (const item of active) {
        counts[item.current_stage] = (counts[item.current_stage] ?? 0) + item.quantity;
      }
      setLowStockCount(lowStock.length);
      setActiveItems(active.reduce((s, i) => s + i.quantity, 0));
      setStageCounts(counts);
      setUpcomingFirings(firings.length);
      setFinishedStock(finished);
      setStockValue(value);
      setStudioName(profile.studio_name);
      setOwnerName(profile.owner_name);
      setActiveStages(profile.active_stages);
    } catch (_) {
      // Sessiz hata — kullanıcıya boş ekran gösterilir
    }
  }, []);

  useFocusEffect(useCallback(() => { loadStats(); }, [loadStats]));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{studioName}</Text>
            <Text style={styles.subtitle}>{ownerName || 'Atölye Yönetim Sistemi'}</Text>
          </View>
          <TouchableOpacity style={styles.logoPlaceholder} onPress={() => router.push('/(tabs)/profile')}>
            <Text style={styles.logoText}>O</Text>
          </TouchableOpacity>
        </View>

        {/* Genel Durum */}
        <Text style={styles.sectionTitle}>Genel Durum</Text>

        {/* Hero — Stok Değeri */}
        <TouchableOpacity
          style={styles.heroCard}
          onPress={() => router.push('/(tabs)/stock')}
          activeOpacity={0.85}
        >
          <View style={styles.heroLeft}>
            <Text style={styles.heroLabel}>Hazır Stok Değeri</Text>
            <Text style={styles.heroAmount}>
              ₺{stockValue.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}
            </Text>
            <Text style={styles.heroSub}>{finishedStock} adet satışa hazır</Text>
          </View>
          <View style={styles.heroIcon}>
            <Ionicons name="trending-up" size={28} color={Colors.success} />
          </View>
        </TouchableOpacity>

        {/* Metrik satırları */}
        <Card style={styles.metricsCard}>
          <MetricRow
            icon="layers"
            label="Düşük Stok"
            value={lowStockCount === 0 ? 'Tamam' : `${lowStockCount} ürün`}
            color={lowStockCount > 0 ? Colors.error : Colors.success}
            alert={lowStockCount > 0}
            onPress={() => router.push('/(tabs)/materials')}
          />
          <MetricRow
            icon="construct"
            label="Aktif Üretim"
            value={`${activeItems} adet`}
            color={Colors.info}
            onPress={() => router.push('/(tabs)/production')}
          />
          <MetricRow
            icon="flame"
            label="Planlı Pişirim"
            value={upcomingFirings === 0 ? 'Yok' : `${upcomingFirings} adet`}
            color={Colors.warning}
            onPress={() => router.push('/(tabs)/kiln')}
          />
          <MetricRow
            icon="cube"
            label="Hazır Ürün"
            value={`${finishedStock} adet`}
            color={Colors.success}
            onPress={() => router.push('/(tabs)/stock')}
            last
          />
        </Card>

        {/* Katalog */}
        <Text style={styles.sectionTitle}>Katalog</Text>
        <View style={styles.quickActions}>
          <QuickAction
            icon="color-palette"
            label="Renk Reçeteleri"
            color={Colors.stages.decal}
            onPress={() => router.push('/(tabs)/colors')}
          />
          <QuickAction
            icon="water"
            label="Sıvı Çamurlar"
            color={Colors.info}
            onPress={() => router.push('/(tabs)/clay')}
          />
          <QuickAction
            icon="diamond"
            label="Ürünler"
            color={Colors.collections.Rigel}
            onPress={() => router.push('/(tabs)/products')}
          />
        </View>

        {/* Hızlı Erişim */}
        <Text style={styles.sectionTitle}>Hızlı İşlem</Text>
        <View style={styles.quickActions}>
          <QuickAction
            icon="add-circle"
            label="Hammadde Alımı"
            color={Colors.accent}
            onPress={() => router.push('/(tabs)/materials')}
          />
          <QuickAction
            icon="flask"
            label="Üretim Başlat"
            color={Colors.info}
            onPress={() => router.push('/(tabs)/production')}
          />
          <QuickAction
            icon="flame"
            label="Fırın Planla"
            color={Colors.warning}
            onPress={() => router.push('/(tabs)/kiln')}
          />
        </View>

        {/* Üretim süreci hatırlatıcı */}
        <Text style={styles.sectionTitle}>Üretim Aşamaları</Text>
        <Card variant="filled" style={styles.processCard}>
          {activeStages.map((stage, i) => {
            const info = STAGE_PROCESS_INFO[stage];
            if (!info) return null;
            const count = stageCounts[stage];
            return (
              <View key={stage} style={styles.processStep}>
                <View style={[styles.stepDot, { backgroundColor: Colors.stages[stage] }]} />
                <View style={styles.stepContent}>
                  <View style={styles.stepRow}>
                    <Text style={styles.stepTitle}>{info.title}</Text>
                    {count != null && count > 0 && (
                      <View style={[styles.stepBadge, { backgroundColor: Colors.stages[stage] + '25' }]}>
                        <Text style={[styles.stepBadgeText, { color: Colors.stages[stage] }]}>
                          {count} adet
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.stepDesc}>{info.desc}</Text>
                </View>
                {i < activeStages.length - 1 && <View style={styles.stepLine} />}
              </View>
            );
          })}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickAction({ icon, label, color, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.quickIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}


const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  content: { padding: Spacing.md, paddingBottom: Spacing.xl },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  greeting: { ...Typography.h1, color: Colors.text },
  subtitle: { ...Typography.body, color: Colors.textSecondary, marginTop: 2 },
  logoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { ...Typography.h2, color: Colors.surface },

  sectionTitle: {
    ...Typography.label,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
  },

  heroCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  heroLeft: { gap: 2 },
  heroLabel: { ...Typography.caption, color: Colors.textSecondary, fontWeight: '500', letterSpacing: 0.3 },
  heroAmount: { ...Typography.h1, color: Colors.text, fontSize: 32, lineHeight: 38, marginTop: 2 },
  heroSub: { ...Typography.caption, color: Colors.textMuted, marginTop: 4 },
  heroIcon: {
    width: 52, height: 52,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.success + '15',
    alignItems: 'center', justifyContent: 'center',
  },

  metricsCard: { gap: 0, padding: 0, overflow: 'hidden' },
  metricRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
  },
  metricRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  metricIcon: {
    width: 34, height: 34, borderRadius: BorderRadius.sm,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  alertDot: {
    position: 'absolute', top: 2, right: 2,
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: Colors.error,
    borderWidth: 1, borderColor: Colors.surface,
  },
  metricLabel: { ...Typography.body, color: Colors.text, flex: 1 },
  metricValue: { ...Typography.body, fontWeight: '700' },

  quickActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  quickIcon: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },

  processCard: { gap: 0 },
  processStep: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, position: 'relative' },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
    flexShrink: 0,
  },
  stepContent: { flex: 1, paddingBottom: Spacing.md },
  stepLine: {
    position: 'absolute',
    left: 5,
    top: 16,
    width: 2,
    height: Spacing.md + 4,
    backgroundColor: Colors.border,
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  stepTitle: { ...Typography.bodySmall, fontWeight: '600', color: Colors.text },
  stepDesc: { ...Typography.caption, color: Colors.textSecondary, marginTop: 1 },
  stepBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  stepBadgeText: { ...Typography.caption, fontWeight: '700', fontSize: 11 },
});
