import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Modal, Alert, TextInput, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Colors, Spacing, Typography, BorderRadius } from '../../src/constants/theme';
import { Card } from '../../src/components/Card';
import { StageBadge } from '../../src/components/StageBadge';
import {
  ProductionPlan, DayPlanInfo, addProductionPlan, deleteProductionPlan,
  getPlansForDate, getPlannedDatesForMonth, getPlannedQuantityForItem,
  markPlanCompleted, unmarkPlanCompleted, getCompletedQuantityForItem,
} from '../../src/services/plans';
import { getActiveProductionItems, updateProductionItemStage, revertProductionItemStage, getProductionItemStage } from '../../src/services/production';
import { getKilnFiringCountsForMonth } from '../../src/services/kiln';
import { getProfile } from '../../src/services/settings';
import { ProductionItem, ProductionStage } from '../../src/types';

const ALL_STAGES: ProductionStage[] = [
  'casting', 'drying', 'bisque', 'bisque_done',
  'glazing', 'glaze_firing',
  'decal', 'decal_firing', 'sanding', 'finished',
];

const MONTH_NAMES = [
  'Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
  'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık',
];
const DAY_LABELS = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'];
// Fırın sekmesinden yönetilen aşamalar — takvimde planlanamaz
const KILN_STAGES: ProductionStage[] = ['bisque', 'glaze_firing', 'decal_firing'];

const ORANGE = '#E89240';
function partialBg(pendingCount: number): string {
  if (pendingCount >= 3) return `${ORANGE}55`;
  if (pendingCount === 2) return `${ORANGE}33`;
  return `${ORANGE}1A`;
}
function partialText(pendingCount: number): string {
  if (pendingCount >= 3) return ORANGE;
  if (pendingCount === 2) return `${ORANGE}CC`;
  return `${ORANGE}99`;
}
const CELL_SIZE = Math.floor((Dimensions.get('window').width - Spacing.md * 2) / 7);

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}
function firstWeekday(year: number, month: number) {
  const d = new Date(year, month - 1, 1).getDay();
  return d === 0 ? 6 : d - 1; // Monday-first
}
function formatSelectedDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function formatCompletedAt(completedAt: string) {
  // SQLite datetime: "2026-04-23 01:39:00" → "23 Nisan 2026, 01:39"
  const [datePart, timePart] = completedAt.split(' ');
  const [y, m, d] = datePart.split('-').map(Number);
  const time = timePart?.slice(0, 5) ?? '';
  return `${d} ${MONTH_NAMES[m - 1]} ${y}, ${time}`;
}

export default function CalendarScreen() {
  const today = todayStr();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState(today);
  const [planDots, setPlanDots] = useState<Record<string, DayPlanInfo>>({});
  const [kilnDots, setKilnDots] = useState<Record<string, number>>({});
  const [dayPlans, setDayPlans] = useState<ProductionPlan[]>([]);
  const [activeItems, setActiveItems] = useState<ProductionItem[]>([]);
  const [activeStages, setActiveStages] = useState<ProductionStage[]>([...ALL_STAGES]);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ProductionItem | null>(null);
  const [planQty, setPlanQty] = useState('1');
  const [itemPlannedQtys, setItemPlannedQtys] = useState<Record<number, number>>({});

  const loadMonth = useCallback(async (y: number, m: number) => {
    const [dots, kilns] = await Promise.all([
      getPlannedDatesForMonth(y, m),
      getKilnFiringCountsForMonth(y, m),
    ]);
    setPlanDots(dots);
    setKilnDots(kilns);
  }, []);

  const loadDay = useCallback(async (date: string) => {
    const plans = await getPlansForDate(date);
    setDayPlans(plans);
  }, []);

  const load = useCallback(async () => {
    const [items, profile] = await Promise.all([
      getActiveProductionItems(),
      getProfile(),
    ]);
    setActiveItems(items);
    setActiveStages(profile.active_stages);
    await Promise.all([loadMonth(year, month), loadDay(selectedDate)]);
  }, [year, month, selectedDate, loadMonth, loadDay]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function changeMonth(delta: number) {
    let y = year, m = month + delta;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setYear(y); setMonth(m);
    await loadMonth(y, m);
  }

  async function selectDate(date: string) {
    setSelectedDate(date);
    await loadDay(date);
  }

  async function openAdd() {
    const items = await getActiveProductionItems();
    setActiveItems(items);
    const qtys: Record<number, number> = {};
    await Promise.all(
      items.map(async item => {
        // Sadece kalemin mevcut aşamasındaki planları say
        qtys[item.id] = await getPlannedQuantityForItem(item.id, item.current_stage);
      })
    );
    setItemPlannedQtys(qtys);
    setSelectedItem(null);
    setPlanQty('1');
    setShowAdd(true);
  }

  async function handleAddPlan() {
    if (!selectedItem) return Alert.alert('Hata', 'Bir kalem seçin');
    const qty = parseInt(planQty) || 0;
    if (qty <= 0) return Alert.alert('Hata', 'Geçerli bir adet girin');
    const alreadyPlanned = itemPlannedQtys[selectedItem.id] ?? 0;
    const remaining = selectedItem.quantity - alreadyPlanned;
    if (qty > remaining) {
      return Alert.alert('Hata', `En fazla ${remaining} adet planlanabilir`);
    }
    await addProductionPlan({
      production_item_id: selectedItem.id,
      planned_date: selectedDate,
      stage: selectedItem.current_stage,
      quantity: qty,
    });
    setShowAdd(false);
    await loadDay(selectedDate);
    await loadMonth(year, month);
  }

  async function handleCompletePlan(plan: ProductionPlan) {
    if (plan.completed_at) {
      // Zaten tamamlanmış — geri al seçeneği sun
      Alert.alert(
        'Tamamlandı',
        `Bu plan tamamlandı olarak işaretli. Geri almak istiyor musun?`,
        [
          { text: 'Kapat', style: 'cancel' },
          {
            text: 'Geri Al',
            style: 'destructive',
            onPress: async () => {
              await unmarkPlanCompleted(plan.id);

              // Geri alma sonrası: sadece bu aşamadaki tamamlananları say
              const completedQty = await getCompletedQuantityForItem(plan.production_item_id, plan.stage);
              if (completedQty < plan.total_quantity) {
                const actualStage = await getProductionItemStage(plan.production_item_id);
                const planStageIdx    = ALL_STAGES.indexOf(plan.stage);
                const currentStageIdx = actualStage ? ALL_STAGES.indexOf(actualStage) : -1;
                if (currentStageIdx > planStageIdx && actualStage) {
                  await revertProductionItemStage(
                    plan.production_item_id,
                    actualStage,   // DB'den gelen gerçek aşama
                    plan.stage     // planın oluşturulduğu aşama
                  );
                }
              }

              await loadDay(selectedDate);
              await loadMonth(year, month);
            },
          },
        ]
      );
      return;
    }

    Alert.alert(
      'Planı Tamamla',
      `${plan.quantity} adet "${plan.product_name}" tamamlandı olarak işaretlensin mi?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Tamamlandı',
          onPress: async () => {
            await markPlanCompleted(plan.id);

            // Bu aşamadaki tamamlanan toplam adedi kontrol et (önceki aşamalar sayılmasın)
            const completedQty = await getCompletedQuantityForItem(plan.production_item_id, plan.stage);
            if (completedQty >= plan.total_quantity) {
              // Tüm adetler tamamlandı → bir sonraki aşamaya geç
              // Güvenlik: kalem zaten bir fırın-bekleme aşamasındaysa takvimden ilerletme
              // (fırın sekmes yönetir), sadece planın oluşturulduğu aşamadan ilerle
              const advanceFrom = plan.current_stage;
              if (!KILN_STAGES.includes(advanceFrom)) {
                const currentIdx = ALL_STAGES.indexOf(advanceFrom);
                const nextStage = ALL_STAGES[currentIdx + 1] ?? null;
                if (nextStage) {
                  await updateProductionItemStage(plan.production_item_id, nextStage);
                }
              }
            }

            await loadDay(selectedDate);
            await loadMonth(year, month);
          },
        },
      ]
    );
  }

  async function handleDeletePlan(id: number) {
    Alert.alert('Planı Sil', 'Bu plan silinsin mi?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil', style: 'destructive',
        onPress: async () => {
          await deleteProductionPlan(id);
          await loadDay(selectedDate);
          await loadMonth(year, month);
        },
      },
    ]);
  }

  // Takvim grid hücreleri
  const offset = firstWeekday(year, month);
  const numDays = daysInMonth(year, month);
  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= numDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Başlık */}
      <View style={styles.header}>
        <Text style={styles.title}>Takvim</Text>
      </View>

      {/* Ay navigasyonu */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={20} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{MONTH_NAMES[month - 1]} {year}</Text>
        <TouchableOpacity onPress={() => changeMonth(1)} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={20} color={Colors.text} />
        </TouchableOpacity>
      </View>

      {/* Gün başlıkları */}
      <View style={styles.dayLabels}>
        {DAY_LABELS.map(d => (
          <Text key={d} style={styles.dayLabel}>{d}</Text>
        ))}
      </View>

      {/* Takvim grid */}
      <View style={styles.calGrid}>
        {cells.map((day, i) => {
          if (!day) return <View key={`e${i}`} style={styles.calCell} />;
          const ds = toDateStr(year, month, day);
          const isSelected = ds === selectedDate;
          const isToday = ds === today;
          const dayInfo = planDots[ds];
          const planStatus = dayInfo?.status ?? 'none';
          const kilnCount = kilnDots[ds] ?? 0;
          return (
            <TouchableOpacity
              key={ds}
              style={[
                styles.calCell,
                isSelected && styles.calCellSelected,
                isToday && !isSelected && styles.calCellToday,
                !isSelected && planStatus === 'all_done' && styles.calCellAllDone,
                !isSelected && planStatus === 'partial' && {
                  backgroundColor: partialBg(dayInfo?.pending_count ?? 1),
                },
              ]}
              onPress={() => selectDate(ds)}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.calDayText,
                isSelected && styles.calDayTextSelected,
                isToday && !isSelected && styles.calDayTextToday,
                !isSelected && planStatus === 'all_done' && styles.calDayTextDone,
                !isSelected && planStatus === 'partial' && {
                  color: partialText(dayInfo?.pending_count ?? 1),
                  fontWeight: '700',
                },
              ]}>{day}</Text>
              {kilnCount > 0 && (
                <View style={styles.kilnDotRow}>
                  {Array.from({ length: Math.min(kilnCount, 2) }).map((_, i) => (
                    <View
                      key={i}
                      style={[styles.kilnDot, isSelected && styles.kilnDotSelected]}
                    />
                  ))}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Seçili gün planları */}
      <View style={styles.daySection}>
        <Text style={styles.daySectionTitle}>{formatSelectedDate(selectedDate)}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Ionicons name="add" size={20} color={Colors.surface} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.planList}
        contentContainerStyle={styles.planListContent}
        showsVerticalScrollIndicator={false}
      >
        {dayPlans.length === 0 ? (
          <Text style={styles.emptyText}>Bu gün için plan yok</Text>
        ) : (
          dayPlans.map(plan => {
            const isDone = !!plan.completed_at;
            return (
              <Card
                key={plan.id}
                style={[styles.planCard, isDone && styles.planCardDone]}
                onPress={() => handleCompletePlan(plan)}
              >
                <View style={styles.planRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.planName, isDone && styles.planNameDone]}>
                      {plan.product_name}
                    </Text>
                    {(plan.liquid_clay_name || plan.color_recipe_name || plan.glaze_material_name) && (
                      <Text style={styles.planColor}>
                        {[plan.liquid_clay_name ?? plan.color_recipe_name, plan.glaze_material_name]
                          .filter(Boolean).join(' · ')}
                      </Text>
                    )}
                    <Text style={styles.planBatch}>Parti: {plan.batch_date}</Text>
                    {plan.completed_at && (
                      <Text style={styles.planCompletedAt}>
                        Tamamlandı: {formatCompletedAt(plan.completed_at)}
                      </Text>
                    )}
                  </View>
                  <View style={styles.planRight}>
                    {isDone ? (
                      <View style={styles.doneBadge}>
                        <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                        <Text style={styles.doneText}>Tamam</Text>
                      </View>
                    ) : (
                      <View style={styles.qtyBadge}>
                        <Text style={styles.qtyText}>{plan.quantity} adet</Text>
                      </View>
                    )}
                    {!isDone && (
                      <TouchableOpacity onPress={() => handleDeletePlan(plan.id)} style={{ padding: 4 }}>
                        <Ionicons name="trash-outline" size={16} color={Colors.error} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <View style={styles.planFooter}>
                  <StageBadge stage={plan.stage} size="sm" />
                  <Text style={styles.planTotal}>
                    {isDone ? `${plan.quantity} / ` : ''}{plan.total_quantity} adet
                  </Text>
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>

      {/* Plan Ekle Modal */}
      <Modal
        visible={showAdd}
        animationType="slide"
        presentationStyle="pageSheet"
        onDismiss={() => setShowAdd(false)}
      >
        <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Plan Ekle</Text>
            <TouchableOpacity onPress={() => setShowAdd(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>
          <Text style={styles.modalSubtitle}>{formatSelectedDate(selectedDate)}</Text>

          <ScrollView style={styles.modalBody}>
            <Text style={styles.fieldLabel}>Üretim Kalemi</Text>
            {activeItems.filter(item =>
                !KILN_STAGES.includes(item.current_stage) &&
                item.quantity - (itemPlannedQtys[item.id] ?? 0) > 0
              ).length === 0 ? (
              <Text style={styles.emptyText}>Planlanabilir üretim kalemi yok</Text>
            ) : (
              activeItems
                .filter(item =>
                  !KILN_STAGES.includes(item.current_stage) &&
                  item.quantity - (itemPlannedQtys[item.id] ?? 0) > 0
                )
                .map(item => {
                const planned = itemPlannedQtys[item.id] ?? 0;
                const remaining = item.quantity - planned;
                const isSelected = selectedItem?.id === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.itemOption, isSelected && styles.itemOptionActive]}
                    onPress={() => {
                      setSelectedItem(item);
                      setPlanQty(String(Math.max(1, Math.min(remaining, 1))));
                    }}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.itemName, isSelected && { color: Colors.surface }]}>
                        {item.product_name}
                      </Text>
                      {(item.liquid_clay_batch_name || item.color_recipe_name || item.glaze_material_name) && (
                        <Text style={[styles.itemColor, isSelected && { color: Colors.surface + 'cc' }]}>
                          {[item.liquid_clay_batch_name ?? item.color_recipe_name, item.glaze_material_name]
                            .filter(Boolean).join(' · ')}
                        </Text>
                      )}
                      <Text style={[styles.itemSub, isSelected && { color: Colors.surface + 'bb' }]}>
                        {item.quantity} adet · {remaining} planlanmadı
                      </Text>
                    </View>
                    <StageBadge stage={item.current_stage} size="sm" />
                  </TouchableOpacity>
                );
              })
            )}

            {selectedItem && (
              <>
                <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>
                  Adet
                  <Text style={styles.maxHint}>
                    {' '}(max {selectedItem.quantity - (itemPlannedQtys[selectedItem.id] ?? 0)})
                  </Text>
                </Text>
                <TextInput
                  style={styles.input}
                  value={planQty}
                  onChangeText={setPlanQty}
                  keyboardType="number-pad"
                  placeholder="1"
                  placeholderTextColor={Colors.textMuted}
                />
              </>
            )}
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.saveBtn} onPress={handleAddPlan}>
              <Text style={styles.saveBtnText}>Kaydet</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  title: { ...Typography.h1, color: Colors.text },

  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  navBtn: { padding: 6 },
  monthTitle: { ...Typography.h2, color: Colors.text },

  dayLabels: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    marginBottom: 4,
  },
  dayLabel: {
    width: CELL_SIZE,
    textAlign: 'center',
    ...Typography.caption,
    color: Colors.textSecondary,
    fontWeight: '600',
  },

  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  calCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: CELL_SIZE / 2,
  },
  kilnDotRow: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 2,
  },
  kilnDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C0392B',
  },
  kilnDotSelected: {
    backgroundColor: Colors.surface,
  },
  calCellSelected: {
    backgroundColor: Colors.primary,
  },
  calCellToday: {
    backgroundColor: Colors.accentLight,
  },
  calCellAllDone: {
    backgroundColor: '#4E8B6B22', // soft yeşil
  },
  calDayText: {
    ...Typography.bodySmall,
    color: Colors.text,
    fontWeight: '500',
  },
  calDayTextSelected: {
    color: Colors.surface,
    fontWeight: '700',
  },
  calDayTextToday: {
    color: Colors.primary,
    fontWeight: '700',
  },
  calDayTextDone: {
    color: '#4E8B6B',
    fontWeight: '700',
  },

  daySection: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  daySectionTitle: { ...Typography.body, fontWeight: '600', color: Colors.text },
  addBtn: {
    backgroundColor: Colors.primary, width: 32, height: 32,
    borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center',
  },

  planList: { flex: 1 },
  planListContent: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xl },

  planCard: { gap: Spacing.xs },
  planCardDone: { opacity: 0.7, borderColor: Colors.success },
  planRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  planName: { ...Typography.body, fontWeight: '600', color: Colors.text },
  planNameDone: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  planColor: { ...Typography.caption, color: Colors.primary, fontWeight: '500' },
  planBatch: { ...Typography.caption, color: Colors.textSecondary },
  planCompletedAt: { ...Typography.caption, color: Colors.success, fontWeight: '500' },
  planRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  qtyBadge: {
    backgroundColor: Colors.accentLight, borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
  },
  qtyText: { ...Typography.caption, fontWeight: '600', color: Colors.primaryLight },
  doneBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.success + '20', borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
  },
  doneText: { ...Typography.caption, fontWeight: '600', color: Colors.success },
  planFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planTotal: { ...Typography.caption, color: Colors.textMuted },

  emptyText: {
    ...Typography.body, color: Colors.textMuted,
    textAlign: 'center', paddingVertical: Spacing.lg,
  },

  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: { ...Typography.h2, color: Colors.text },
  modalSubtitle: {
    ...Typography.bodySmall, color: Colors.textSecondary,
    paddingHorizontal: Spacing.md, paddingTop: Spacing.xs,
  },
  modalBody: { flex: 1, padding: Spacing.md },
  modalFooter: {
    padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border,
  },

  fieldLabel: { ...Typography.label, color: Colors.textSecondary, marginBottom: 8 },
  maxHint: { ...Typography.caption, color: Colors.textMuted, fontWeight: '400' },
  input: {
    ...Typography.body, color: Colors.text,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, paddingVertical: 12,
  },

  itemOption: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
  },
  itemOptionActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  itemName: { ...Typography.bodySmall, fontWeight: '600', color: Colors.text },
  itemColor: { ...Typography.caption, color: Colors.primary, fontWeight: '500' },
  itemSub: { ...Typography.caption, color: Colors.textSecondary },

  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.sm,
    paddingVertical: 14, alignItems: 'center',
  },
  saveBtnText: { ...Typography.body, fontWeight: '600', color: Colors.surface },
});
