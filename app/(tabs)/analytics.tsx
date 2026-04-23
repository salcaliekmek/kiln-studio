import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Colors, Spacing, Typography, BorderRadius } from '../../src/constants/theme';
import { Card } from '../../src/components/Card';
import {
  AnalyticsPeriod, AnalyticsSummary, MonthlySpending, SpendingByType,
  TopMaterial, StageDistribution, StockByCollection, StockByStageRow,
  ElectricityStats, MonthlyElectricity, ElectricityByFiringType,
  getAnalyticsSummary, getMonthlySpending, getSpendingByType,
  getTopMaterials, getStageDistribution, getStockByCollection,
  getStockByStageBreakdown,
  getElectricityStats, getMonthlyElectricityCost, getElectricityByFiringType,
} from '../../src/services/analytics';
import { router } from 'expo-router';

// ─── Yardımcı formatlayıcılar ─────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1000) return `₺${(n / 1000).toFixed(1)}B`;
  return `₺${n.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;
}

function fmtFull(n: number): string {
  return `₺${n.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}`;
}

// ─── Dönem seçici ─────────────────────────────────────────────────────────

const PERIODS: { key: AnalyticsPeriod; label: string }[] = [
  { key: 'month', label: 'Bu Ay' },
  { key: 'year',  label: 'Bu Yıl' },
  { key: 'all',   label: 'Tümü' },
];

// ─── KPI Kartı ────────────────────────────────────────────────────────────

function KpiCard({
  icon, label, value, sub, color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <View style={[styles.kpiCard, { borderLeftColor: color }]}>
      <View style={[styles.kpiIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {sub ? <Text style={styles.kpiSub}>{sub}</Text> : null}
    </View>
  );
}

// ─── Dikey Bar Grafik ─────────────────────────────────────────────────────

function BarChart({
  data,
  color,
  subData,
  subSuffix,
}: {
  data: { label: string; total: number }[];
  color: string;
  subData?: number[];
  subSuffix?: string;
}) {
  if (!data.length) return <EmptyChart />;
  const max = Math.max(...data.map(d => d.total), 1);
  return (
    <View style={styles.barChart}>
      {data.map((item, i) => {
        const pct = item.total / max;
        const height = Math.max(pct * 120, item.total > 0 ? 4 : 2);
        const sub = subData?.[i];
        return (
          <View key={i} style={styles.barGroup}>
            <Text style={styles.barTopLabel}>{item.total > 0 ? fmt(item.total) : ''}</Text>
            <View style={styles.barBg}>
              <View
                style={[
                  styles.barFill,
                  { height, backgroundColor: item.total > 0 ? color : Colors.border },
                ]}
              />
            </View>
            <Text style={styles.barBotLabel}>{item.label}</Text>
            {sub !== undefined && sub > 0 && (
              <Text style={[styles.barBotLabel, { color: Colors.textMuted }]}>
                {sub.toFixed(0)}{subSuffix ?? ''}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Yatay Bar (oran) ─────────────────────────────────────────────────────

function HBar({
  label, value, total, color, suffix = '',
}: {
  label: string; value: number; total: number; color: string; suffix?: string;
}) {
  const pct = total > 0 ? Math.max((value / total) * 100, value > 0 ? 2 : 0) : 0;
  const pctDisplay = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <View style={styles.hbarRow}>
      <View style={styles.hbarHeader}>
        <View style={[styles.hbarDot, { backgroundColor: color }]} />
        <Text style={styles.hbarLabel} numberOfLines={1}>{label}</Text>
        <Text style={[styles.hbarValue, { color }]}>
          {suffix || fmtFull(value)}
          <Text style={styles.hbarPct}>  %{pctDisplay}</Text>
        </Text>
      </View>
      <View style={styles.hbarBg}>
        <View style={[styles.hbarFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ─── Boş grafik durumu ────────────────────────────────────────────────────

function EmptyChart() {
  return (
    <View style={styles.emptyChart}>
      <Ionicons name="bar-chart-outline" size={32} color={Colors.border} />
      <Text style={styles.emptyChartText}>Henüz veri yok</Text>
    </View>
  );
}

// ─── Section başlığı ──────────────────────────────────────────────────────

function SectionTitle({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={14} color={Colors.textSecondary} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ─── Ana ekran ────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const [period, setPeriod] = useState<AnalyticsPeriod>('year');

  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [monthly, setMonthly] = useState<MonthlySpending[]>([]);
  const [byType, setByType] = useState<SpendingByType[]>([]);
  const [topMats, setTopMats] = useState<TopMaterial[]>([]);
  const [stages, setStages] = useState<StageDistribution[]>([]);
  const [collections, setCollections] = useState<StockByCollection[]>([]);
  const [stockStages, setStockStages] = useState<StockByStageRow[]>([]);
  const [elecStats, setElecStats] = useState<ElectricityStats | null>(null);
  const [elecMonthly, setElecMonthly] = useState<MonthlyElectricity[]>([]);
  const [elecByType, setElecByType] = useState<ElectricityByFiringType[]>([]);

  const load = useCallback(async (p: AnalyticsPeriod) => {
    try {
      const [s, m, bt, tm, st, col, ss, es, em, et] = await Promise.all([
        getAnalyticsSummary(p),
        getMonthlySpending(6),
        getSpendingByType(p),
        getTopMaterials(p),
        getStageDistribution(),
        getStockByCollection(),
        getStockByStageBreakdown(),
        getElectricityStats(p),
        getMonthlyElectricityCost(6),
        getElectricityByFiringType(p),
      ]);
      setSummary(s);
      setMonthly(m);
      setByType(bt);
      setTopMats(tm);
      setStages(st);
      setCollections(col);
      setStockStages(ss);
      setElecStats(es);
      setElecMonthly(em);
      setElecByType(et);
    } catch (_) {
      // Sessiz hata — ekran boş kalır
    }
  }, []);

  useFocusEffect(useCallback(() => { load(period); }, [load, period]));

  const handlePeriod = (p: AnalyticsPeriod) => {
    setPeriod(p);
    load(p);
  };

  const totalType = byType.reduce((s, r) => s + r.total, 0);
  const totalCollection = collections.reduce((s, r) => s + r.value, 0);
  const totalStage = stockStages.reduce((s, r) => s + r.quantity, 0);
  const totalStageActive = stages.reduce((s, r) => s + r.count, 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Başlık */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Analiz</Text>
          <Text style={styles.subtitle}>Harcama & üretim istatistikleri</Text>
        </View>
        <View style={[styles.headerIcon, { backgroundColor: Colors.primary + '15' }]}>
          <Ionicons name="analytics" size={22} color={Colors.primary} />
        </View>
      </View>

      {/* Dönem seçici */}
      <View style={styles.periodRow}>
        {PERIODS.map(p => (
          <TouchableOpacity
            key={p.key}
            style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
            onPress={() => handlePeriod(p.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.periodText, period === p.key && styles.periodTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── KPI Grid ── */}
        {summary && (
          <View style={styles.kpiGrid}>
            <KpiCard
              icon="cart"
              label="Hammadde Alımı"
              value={fmtFull(summary.total_purchase_cost)}
              color={Colors.accent}
            />
            <KpiCard
              icon="trending-up"
              label="Stok Değeri"
              value={fmtFull(summary.stock_value)}
              sub={`${summary.total_produced_qty} adet üretildi`}
              color={Colors.success}
            />
            <KpiCard
              icon="construct"
              label="Aktif Üretim"
              value={`${summary.active_production_qty} adet`}
              color={Colors.info}
            />
            <KpiCard
              icon="water"
              label="Sıvı Çamur"
              value={`${summary.liquid_clay_batch_count} parti`}
              sub={`${summary.liquid_clay_available_kg.toFixed(1)} kg mevcut`}
              color={Colors.warning}
            />
          </View>
        )}

        {/* ── Aylık Hammadde Harcaması ── */}
        <SectionTitle icon="bar-chart" title="Aylık Hammadde Harcaması" />
        <Card style={styles.card}>
          <Text style={styles.cardNote}>Son 6 ay</Text>
          <BarChart
            data={monthly.map(m => ({ label: m.label, total: m.total }))}
            color={Colors.accent}
          />
        </Card>

        {/* ── Türe Göre Harcama ── */}
        <SectionTitle icon="pie-chart" title="Malzeme Türüne Göre Harcama" />
        <Card style={styles.card}>
          {byType.length === 0 ? (
            <EmptyChart />
          ) : (
            <View style={styles.hbarList}>
              {byType.map((r, i) => (
                <HBar
                  key={i}
                  label={r.label}
                  value={r.total}
                  total={totalType}
                  color={r.color}
                />
              ))}
            </View>
          )}
        </Card>

        {/* ── En Çok Harcanan Hammaddeler ── */}
        {topMats.length > 0 && (
          <>
            <SectionTitle icon="podium" title="En Çok Harcanan Hammaddeler" />
            <Card style={styles.card}>
              {topMats.map((m, i) => {
                const color = byType.find(b => b.type === m.type)?.color ?? Colors.textMuted;
                return (
                  <View
                    key={i}
                    style={[styles.topMatRow, i < topMats.length - 1 && styles.topMatBorder]}
                  >
                    <View style={[styles.rankBadge, { backgroundColor: color + '22' }]}>
                      <Text style={[styles.rankText, { color }]}>{i + 1}</Text>
                    </View>
                    <Text style={styles.topMatName} numberOfLines={1}>{m.name}</Text>
                    <Text style={[styles.topMatCost, { color }]}>{fmtFull(m.total_cost)}</Text>
                  </View>
                );
              })}
            </Card>
          </>
        )}

        {/* ── Elektrik Harcaması ── */}
        <SectionTitle icon="flash" title="Elektrik Harcaması" />

        {/* Fiyat girilmemiş uyarısı */}
        {elecStats && !elecStats.has_price_data && (
          <TouchableOpacity
            style={styles.warningCard}
            onPress={() => router.push('/(tabs)/profile')}
            activeOpacity={0.8}
          >
            <Ionicons name="warning-outline" size={18} color={Colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.warningTitle}>Elektrik fiyatı girilmemiş</Text>
              <Text style={styles.warningBody}>
                Profil → Elektrik Fiyatları bölümünden aylık ₺/kWh değerini girin.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Eksik veri uyarısı (fiyat var ama bazı pişirimlerde fırın/süre yok) */}
        {elecStats && elecStats.has_price_data && elecStats.firings_without_data > 0 && (
          <View style={styles.infoCard}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.info} />
            <Text style={styles.infoText}>
              {elecStats.firings_without_data} pişirimde fırın veya süre eksik — bunlar hesaba katılmadı.
            </Text>
          </View>
        )}

        {/* Elektrik KPI çifti */}
        {elecStats && (
          <View style={styles.kpiRow}>
            <View style={[styles.kpiCardWide, { borderLeftColor: '#E67E22' }]}>
              <View style={[styles.kpiIcon, { backgroundColor: '#E67E2218' }]}>
                <Ionicons name="flash" size={18} color="#E67E22" />
              </View>
              <Text style={styles.kpiValue}>{fmtFull(elecStats.total_cost)}</Text>
              <Text style={styles.kpiLabel}>Toplam Elektrik Maliyeti</Text>
              {elecStats.firing_count > 0 && (
                <Text style={styles.kpiSub}>
                  Ort. {fmtFull(elecStats.avg_cost_per_firing)} / pişirim
                </Text>
              )}
            </View>
            <View style={[styles.kpiCardWide, { borderLeftColor: '#8E44AD' }]}>
              <View style={[styles.kpiIcon, { backgroundColor: '#8E44AD18' }]}>
                <Ionicons name="speedometer-outline" size={18} color="#8E44AD" />
              </View>
              <Text style={styles.kpiValue}>
                {elecStats.total_kwh.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} kWh
              </Text>
              <Text style={styles.kpiLabel}>Toplam Enerji Tüketimi</Text>
              <Text style={styles.kpiSub}>{elecStats.firing_count} pişirim hesaplandı</Text>
            </View>
          </View>
        )}

        {/* Aylık elektrik bar grafiği */}
        <Card style={styles.card}>
          <Text style={styles.cardNote}>Son 6 ay — tamamlanan pişirimler</Text>
          {elecMonthly.length === 0 ? (
            <EmptyChart />
          ) : (
            <BarChart
              data={elecMonthly.map(e => ({ label: e.label, total: e.cost }))}
              color="#E67E22"
              subData={elecMonthly.map(e => e.kwh)}
              subSuffix=" kWh"
            />
          )}
        </Card>

        {/* Pişirim türüne göre elektrik dağılımı */}
        {elecByType.length > 0 && (
          <>
            <SectionTitle icon="flame" title="Pişirim Türüne Göre Elektrik" />
            <Card style={styles.card}>
              <View style={styles.hbarList}>
                {elecByType.map((r, i) => {
                  const totalCost = elecByType.reduce((s, x) => s + x.cost, 0);
                  return (
                    <View key={i} style={styles.elecTypeRow}>
                      <HBar
                        label={`${r.label}  (${r.firing_count} pişirim)`}
                        value={r.cost}
                        total={totalCost}
                        color={r.color}
                      />
                      <Text style={[styles.elecKwh, { color: r.color }]}>
                        {r.kwh.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} kWh
                      </Text>
                    </View>
                  );
                })}
              </View>
            </Card>
          </>
        )}

        {/* ── Aktif Üretim Dağılımı ── */}
        <SectionTitle icon="construct" title="Aktif Üretim Aşamaları" />
        <Card style={styles.card}>
          {stages.length === 0 ? (
            <View style={styles.emptyChart}>
              <Ionicons name="construct-outline" size={32} color={Colors.border} />
              <Text style={styles.emptyChartText}>Aktif üretim yok</Text>
            </View>
          ) : (
            <View style={styles.hbarList}>
              {stages.map((s, i) => (
                <HBar
                  key={i}
                  label={s.label}
                  value={s.count}
                  total={totalStageActive}
                  color={s.color}
                  suffix={`${s.count} adet`}
                />
              ))}
            </View>
          )}
        </Card>

        {/* ── Stok Aşama Dağılımı ── */}
        <SectionTitle icon="cube" title="Stok Dağılımı" />
        <Card style={styles.card}>
          {stockStages.length === 0 ? (
            <EmptyChart />
          ) : (
            <View style={styles.hbarList}>
              {stockStages.map((s, i) => (
                <HBar
                  key={i}
                  label={s.label}
                  value={s.quantity}
                  total={totalStage}
                  color={s.color}
                  suffix={`${s.quantity} adet`}
                />
              ))}
            </View>
          )}
        </Card>

        {/* ── Koleksiyona Göre Hazır Stok ── */}
        <SectionTitle icon="diamond" title="Koleksiyona Göre Hazır Stok" />
        <Card style={styles.card}>
          {collections.length === 0 ? (
            <EmptyChart />
          ) : (
            <View style={styles.hbarList}>
              {collections.map((c, i) => {
                const collectionColors: Record<string, string> = {
                  'Rigel':  '#3E6B8B',
                  'Origo':  '#4E8B6B',
                  'Onnimug':'#8B4E6B',
                  'Vega':   '#6B6B3E',
                  'Diğer':  '#6B6B6B',
                };
                const color = collectionColors[c.collection] ?? Colors.textMuted;
                return (
                  <View key={i}>
                    <HBar
                      label={`${c.collection}  (${c.quantity} adet)`}
                      value={c.value}
                      total={totalCollection}
                      color={color}
                    />
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        <View style={{ height: Spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Stiller ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: Colors.background },
  scroll:{ flex: 1 },
  content: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  title:    { ...Typography.h2, color: Colors.text },
  subtitle: { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: 2 },
  headerIcon: {
    width: 44, height: 44, borderRadius: BorderRadius.md,
    alignItems: 'center', justifyContent: 'center',
  },

  // Dönem seçici
  periodRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 3,
  },
  periodBtn: {
    flex: 1, paddingVertical: 7, borderRadius: 6, alignItems: 'center',
  },
  periodBtnActive: {
    backgroundColor: Colors.primary,
  },
  periodText: { ...Typography.bodySmall, color: Colors.textSecondary, fontWeight: '500' },
  periodTextActive: { color: Colors.surface, fontWeight: '700' },

  // KPI
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  kpiCard: {
    width: '47.5%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 3,
  },
  kpiIcon: {
    width: 32, height: 32, borderRadius: BorderRadius.sm,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  kpiValue: { ...Typography.h3, color: Colors.text, fontSize: 17 },
  kpiLabel: { ...Typography.caption, color: Colors.textSecondary, fontWeight: '500' },
  kpiSub:   { ...Typography.caption, color: Colors.textMuted, marginTop: 1 },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.label,
    color: Colors.textSecondary,
  },

  // Card
  card: { padding: Spacing.md, gap: 0 },
  cardNote: { ...Typography.caption, color: Colors.textMuted, marginBottom: Spacing.sm },

  // Dikey bar grafik
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 170,
    paddingTop: Spacing.lg,
  },
  barGroup: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  barTopLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontSize: 9,
    textAlign: 'center',
    marginBottom: 3,
  },
  barBg: {
    width: '72%',
    height: 120,
    backgroundColor: Colors.divider,
    borderRadius: 4,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderRadius: 4,
  },
  barBotLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontSize: 9,
    marginTop: 4,
    textAlign: 'center',
  },

  // Yatay bar
  hbarList: { gap: Spacing.md },
  hbarRow:  { gap: 6 },
  hbarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hbarDot: {
    width: 8, height: 8, borderRadius: 4, flexShrink: 0,
  },
  hbarLabel: {
    ...Typography.bodySmall,
    color: Colors.text,
    flex: 1,
  },
  hbarValue: { ...Typography.bodySmall, fontWeight: '700' },
  hbarPct:   { ...Typography.caption, color: Colors.textMuted, fontWeight: '400' },
  hbarBg: {
    height: 6,
    backgroundColor: Colors.divider,
    borderRadius: 3,
    overflow: 'hidden',
  },
  hbarFill: { height: '100%', borderRadius: 3 },

  // Top materials
  topMatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 10,
  },
  topMatBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  rankBadge: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  rankText: { ...Typography.caption, fontWeight: '800', fontSize: 12 },
  topMatName: { ...Typography.body, color: Colors.text, flex: 1 },
  topMatCost: { ...Typography.body, fontWeight: '700', fontSize: 14 },

  // Elektrik KPI satırı
  kpiRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  kpiCardWide: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 3,
  },

  // Uyarı kartı (fiyat yok)
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.warning + '12',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.warning + '40',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  warningTitle: { ...Typography.bodySmall, fontWeight: '600', color: Colors.warning },
  warningBody:  { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },

  // Bilgi kartı (eksik veri)
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.info + '10',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.info + '30',
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  infoText: { ...Typography.caption, color: Colors.info, flex: 1 },

  // Pişirim türü satırı
  elecTypeRow: { gap: 4 },
  elecKwh: { ...Typography.caption, fontWeight: '600', textAlign: 'right', marginTop: -2 },

  // Boş
  emptyChart: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyChartText: { ...Typography.bodySmall, color: Colors.textMuted },
});
