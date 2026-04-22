import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity,
  Modal, ScrollView, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Colors, Spacing, Typography, BorderRadius } from '../../src/constants/theme';
import { Card } from '../../src/components/Card';
import { Badge } from '../../src/components/Badge';
import { EmptyState } from '../../src/components/EmptyState';
import { getStock, adjustStock, setStock, getStockValue } from '../../src/services/stock';
import { getProducts, calculateStockItemCost, StockCostDetail } from '../../src/services/products';
import { StockEntry, StockStage, Product } from '../../src/types';

const STAGE_LABELS: Record<StockStage, string> = {
  bisque:   'Bisküvi',
  semi:     'Yarı Mamül',
  finished: 'Satışa Hazır',
};
const STAGE_COLORS: Record<StockStage, string> = {
  bisque:   Colors.stages.bisque_done,
  semi:     Colors.stages.glaze_done,
  finished: Colors.stages.finished,
};
const STAGES: StockStage[] = ['finished', 'semi', 'bisque'];

interface Section {
  title: string;
  stage: StockStage;
  data: StockEntry[];
}

export default function StockScreen() {
  const [stockEntries, setStockEntries] = useState<StockEntry[]>([]);
  const [stockValue, setStockValueState] = useState(0);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<StockEntry | null>(null);
  const [costDetail, setCostDetail] = useState<StockCostDetail | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedStage, setSelectedStage] = useState<StockStage>('finished');
  const [manualQty, setManualQty] = useState('');

  const load = useCallback(async () => {
    const [entries, value, prods] = await Promise.all([
      getStock(),
      getStockValue(),
      getProducts(),
    ]);
    setStockEntries(entries);
    setStockValueState(value);
    setProducts(prods);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const sections: Section[] = STAGES.map(stage => ({
    title: STAGE_LABELS[stage],
    stage,
    data: stockEntries.filter(e => e.stage === stage),
  })).filter(s => s.data.length > 0);

  async function handleAdjust(delta: number) {
    if (!selectedEntry) return;
    await adjustStock(selectedEntry.id, delta);
    setShowAdjust(false);
    setAdjustDelta('');
    load();
  }

  async function handleManualSet() {
    if (!selectedProduct) return Alert.alert('Hata', 'Ürün seçin');
    const qty = parseInt(manualQty);
    if (isNaN(qty) || qty < 0) return Alert.alert('Hata', 'Geçerli bir adet girin');
    await setStock(selectedProduct.id, selectedStage, qty);
    setShowManual(false);
    setSelectedProduct(null);
    setManualQty('');
    load();
  }

  const finishedCount = stockEntries.filter(e => e.stage === 'finished').reduce((sum, e) => sum + e.quantity, 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Stok</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowManual(true)}>
          <Ionicons name="add" size={22} color={Colors.surface} />
        </TouchableOpacity>
      </View>

      {/* Summary */}
      <View style={styles.summary}>
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{finishedCount}</Text>
          <Text style={styles.summaryLabel}>Satışa Hazır</Text>
        </Card>
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryValue}>₺{stockValue.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</Text>
          <Text style={styles.summaryLabel}>Stok Değeri</Text>
        </Card>
      </View>

      {sections.length === 0 ? (
        <EmptyState icon="cube-outline" title="Stok boş" subtitle="Üretim tamamlandığında ürünler burada görünür" />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => `${item.id}`}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Badge label={section.title} color={STAGE_COLORS[section.stage]} />
              <Text style={styles.sectionCount}>
                {section.data.reduce((s, e) => s + e.quantity, 0)} adet
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <Card style={styles.stockCard} onPress={async () => {
              setSelectedEntry(item);
              setCostDetail(null);
              if (item.stage === 'finished') {
                const cost = await calculateStockItemCost(item.product_id);
                setCostDetail(cost);
              }
              setShowAdjust(true);
            }}>
              <View style={styles.stockRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stockName}>{item.product_name}</Text>
                  {item.liquid_clay_batch_id > 0 && (
                    <Text style={styles.stockColor}>
                      {item.liquid_clay_batch_name ?? `Çamur #${item.liquid_clay_batch_id}`}
                    </Text>
                  )}
                  <Text style={styles.stockCollection}>{item.collection}</Text>
                </View>
                <View style={styles.stockRight}>
                  <Text style={styles.stockQty}>{item.quantity}</Text>
                  <Text style={styles.stockUnit}>adet</Text>
                </View>
              </View>
            </Card>
          )}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
        />
      )}

      {/* Adjust Modal */}
      <Modal visible={showAdjust} animationType="slide" presentationStyle="pageSheet" onDismiss={() => setShowAdjust(false)}>
        <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Stok Düzenle</Text>
            <TouchableOpacity onPress={() => setShowAdjust(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>
          {selectedEntry && (
            <View style={styles.modalBody}>
              <Card variant="filled" style={styles.adjustInfo}>
                <Text style={styles.adjustName}>{selectedEntry.product_name}</Text>
                <View style={styles.adjustRow}>
                  <Badge label={STAGE_LABELS[selectedEntry.stage]} color={STAGE_COLORS[selectedEntry.stage]} size="sm" />
                  <Text style={styles.adjustQty}>Mevcut: {selectedEntry.quantity} adet</Text>
                </View>
              </Card>

              {/* Maliyet Analizi — sadece Satışa Hazır için */}
              {selectedEntry.stage === 'finished' && costDetail && (
                <Card variant="filled" style={styles.costCard}>
                  <Text style={styles.costTitle}>Maliyet Analizi</Text>

                  {/* Eksik veri uyarıları */}
                  {costDetail.missing_clay_batch && (
                    <View style={styles.costWarning}>
                      <Ionicons name="information-circle-outline" size={14} color={Colors.textSecondary} />
                      <Text style={styles.costWarningText}>Sıvı çamur partisi maliyeti girilmemiş</Text>
                    </View>
                  )}
                  {costDetail.missing_electricity_price && (
                    <View style={styles.costWarning}>
                      <Ionicons name="flash-outline" size={14} color={Colors.textSecondary} />
                      <Text style={styles.costWarningText}>Elektrik birim fiyatı Profil'den girilmeli</Text>
                    </View>
                  )}

                  {/* Hammadde */}
                  <Text style={styles.costGroupLabel}>Hammadde</Text>
                  <View style={styles.costSection}>
                    {costDetail.clay_cost > 0 && (
                      <View style={styles.costRow}>
                        <Text style={styles.costLabel}>
                          Döküm Çamuru{costDetail.casting_weight_gr ? ` (${costDetail.casting_weight_gr}gr)` : ''}
                        </Text>
                        <Text style={styles.costValue}>₺{costDetail.clay_cost.toFixed(2)}</Text>
                      </View>
                    )}
                    {costDetail.glaze_cost > 0 && (
                      <View style={styles.costRow}>
                        <Text style={styles.costLabel}>
                          Sır{costDetail.glaze_uptake_gr != null ? ` (${costDetail.glaze_uptake_gr.toFixed(1)}gr)` : ''}
                        </Text>
                        <Text style={styles.costValue}>₺{costDetail.glaze_cost.toFixed(2)}</Text>
                      </View>
                    )}
                    {costDetail.other_cost > 0 && (
                      <View style={styles.costRow}>
                        <Text style={styles.costLabel}>Diğer Malzemeler</Text>
                        <Text style={styles.costValue}>₺{costDetail.other_cost.toFixed(2)}</Text>
                      </View>
                    )}
                  </View>

                  {/* Pişirim */}
                  {(costDetail.bisque_cost > 0 || costDetail.glaze_firing_cost > 0 || costDetail.decal_cost > 0) && (
                    <>
                      <View style={styles.costDivider} />
                      <Text style={styles.costGroupLabel}>Pişirim (Elektrik)</Text>
                      <View style={styles.costSection}>
                        {costDetail.bisque_cost > 0 && (
                          <View style={styles.costRow}>
                            <Text style={styles.costLabel}>Bisküvi Pişirimi</Text>
                            <Text style={styles.costValue}>₺{costDetail.bisque_cost.toFixed(2)}</Text>
                          </View>
                        )}
                        {costDetail.glaze_firing_cost > 0 && (
                          <View style={styles.costRow}>
                            <Text style={styles.costLabel}>Sır Pişirimi</Text>
                            <Text style={styles.costValue}>₺{costDetail.glaze_firing_cost.toFixed(2)}</Text>
                          </View>
                        )}
                        {costDetail.decal_cost > 0 && (
                          <View style={styles.costRow}>
                            <Text style={styles.costLabel}>Dekal Pişirimi</Text>
                            <Text style={styles.costValue}>₺{costDetail.decal_cost.toFixed(2)}</Text>
                          </View>
                        )}
                      </View>
                    </>
                  )}


                  <View style={styles.costDivider} />

                  <View style={styles.costRow}>
                    <Text style={styles.costLabel}>Birim Toplam Maliyet</Text>
                    <Text style={[styles.costValue, { fontWeight: '700' }]}>₺{costDetail.total.toFixed(2)}</Text>
                  </View>
                  <View style={styles.costRow}>
                    <Text style={styles.costLabel}>Satış Fiyatı</Text>
                    <Text style={styles.costValue}>₺{costDetail.selling_price.toLocaleString('tr-TR')}</Text>
                  </View>
                  <View style={styles.costRow}>
                    <Text style={styles.costLabel}>Birim Kar</Text>
                    <Text style={[styles.costValue, { color: Colors.success, fontWeight: '600' }]}>
                      ₺{costDetail.profit_per_unit.toFixed(2)}
                      {' '}
                      <Text style={styles.costPct}>(%{costDetail.profit_margin_pct.toFixed(0)})</Text>
                    </Text>
                  </View>

                  <View style={styles.costDivider} />

                  <View style={styles.costRow}>
                    <Text style={[styles.costLabel, { fontWeight: '600' }]}>
                      Toplam Maliyet ({selectedEntry.quantity} adet)
                    </Text>
                    <Text style={[styles.costValue, { fontWeight: '700' }]}>
                      ₺{(costDetail.total * selectedEntry.quantity).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                    </Text>
                  </View>
                  <View style={styles.costRow}>
                    <Text style={[styles.costLabel, { fontWeight: '600' }]}>Toplam Kar Potansiyeli</Text>
                    <Text style={[styles.costValue, { color: Colors.success, fontWeight: '700' }]}>
                      ₺{(costDetail.profit_per_unit * selectedEntry.quantity).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                    </Text>
                  </View>
                </Card>
              )}

              <Text style={styles.adjustLabel}>Hızlı Düzenleme</Text>
              <View style={styles.quickAdjust}>
                {[-10, -5, -1, +1, +5, +10].map(delta => (
                  <TouchableOpacity
                    key={delta}
                    style={[styles.deltaBtn, delta > 0 ? styles.deltaBtnPos : styles.deltaBtnNeg]}
                    onPress={() => handleAdjust(delta)}
                  >
                    <Text style={[styles.deltaBtnText, delta > 0 ? { color: Colors.success } : { color: Colors.error }]}>
                      {delta > 0 ? `+${delta}` : delta}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.adjustLabel, { marginTop: Spacing.md }]}>Özel Miktar</Text>
              <View style={styles.customAdjust}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={adjustDelta}
                  onChangeText={setAdjustDelta}
                  keyboardType="number-pad"
                  placeholder="Miktar (negatif için - ekle)"
                  placeholderTextColor={Colors.textMuted}
                />
                <TouchableOpacity
                  style={styles.applyBtn}
                  onPress={() => handleAdjust(parseInt(adjustDelta) || 0)}
                >
                  <Text style={styles.applyBtnText}>Uygula</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* Manual Stock Modal */}
      <Modal visible={showManual} animationType="slide" presentationStyle="pageSheet" onDismiss={() => setShowManual(false)}>
        <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Manuel Stok Girişi</Text>
            <TouchableOpacity onPress={() => setShowManual(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <Text style={styles.fieldLabel}>Ürün</Text>
            <ScrollView style={styles.selectList} nestedScrollEnabled>
              {products.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.selectItem, selectedProduct?.id === p.id && styles.selectItemActive]}
                  onPress={() => setSelectedProduct(p)}
                >
                  <Text style={[styles.selectText, selectedProduct?.id === p.id && styles.selectTextActive]}>
                    {p.name} <Text style={{ color: Colors.textSecondary }}>({p.collection})</Text>
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>Aşama</Text>
            <View style={styles.stageRow}>
              {STAGES.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.stageBtn, selectedStage === s && { backgroundColor: STAGE_COLORS[s] + '30', borderColor: STAGE_COLORS[s] }]}
                  onPress={() => setSelectedStage(s)}
                >
                  <Text style={[styles.stageBtnText, selectedStage === s && { color: STAGE_COLORS[s], fontWeight: '600' }]}>
                    {STAGE_LABELS[s]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>Adet</Text>
            <TextInput style={styles.input} value={manualQty} onChangeText={setManualQty} keyboardType="number-pad" placeholder="0" placeholderTextColor={Colors.textMuted} />
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.saveBtn} onPress={handleManualSet}>
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
  addBtn: {
    backgroundColor: Colors.primary, width: 36, height: 36,
    borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center',
  },
  summary: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  summaryCard: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md },
  summaryValue: { ...Typography.h2, color: Colors.text },
  summaryLabel: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  list: { padding: Spacing.md, paddingBottom: Spacing.xl, gap: Spacing.xs },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  sectionCount: { ...Typography.caption, color: Colors.textSecondary },
  stockCard: {},
  stockRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stockName: { ...Typography.body, fontWeight: '600', color: Colors.text },
  stockColor: { ...Typography.caption, color: Colors.primary, fontWeight: '500' },
  stockCollection: { ...Typography.caption, color: Colors.textSecondary },
  stockRight: { alignItems: 'flex-end' },
  stockQty: { ...Typography.h2, color: Colors.text },
  stockUnit: { ...Typography.caption, color: Colors.textMuted },

  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: { ...Typography.h2, color: Colors.text },
  modalBody: { flex: 1, padding: Spacing.md },
  modalFooter: {
    padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border,
  },

  adjustInfo: { gap: Spacing.xs, marginBottom: Spacing.lg },
  adjustName: { ...Typography.h3, color: Colors.text },
  adjustRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  adjustQty: { ...Typography.bodySmall, color: Colors.textSecondary },
  adjustLabel: { ...Typography.label, color: Colors.textSecondary, marginBottom: Spacing.sm },
  quickAdjust: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  deltaBtn: {
    flex: 1, minWidth: 56, paddingVertical: 12, borderRadius: BorderRadius.sm,
    alignItems: 'center', borderWidth: 1,
  },
  deltaBtnPos: { borderColor: Colors.success, backgroundColor: Colors.success + '15' },
  deltaBtnNeg: { borderColor: Colors.error, backgroundColor: Colors.error + '15' },
  deltaBtnText: { ...Typography.body, fontWeight: '700' },
  customAdjust: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  input: {
    ...Typography.body, color: Colors.text,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, paddingVertical: 12,
  },
  applyBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
  },
  applyBtnText: { ...Typography.body, color: Colors.surface, fontWeight: '600' },

  fieldLabel: { ...Typography.label, color: Colors.textSecondary, marginBottom: 6 },
  selectList: { maxHeight: 220, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.sm },
  selectItem: { padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  selectItemActive: { backgroundColor: Colors.accentLight },
  selectText: { ...Typography.body, color: Colors.text },
  selectTextActive: { fontWeight: '600', color: Colors.primary },
  stageRow: { flexDirection: 'row', gap: Spacing.xs },
  stageBtn: {
    flex: 1, paddingVertical: 10, borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  stageBtnText: { ...Typography.caption, color: Colors.textSecondary, fontWeight: '500' },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.sm,
    paddingVertical: 14, alignItems: 'center',
  },
  saveBtnText: { ...Typography.body, fontWeight: '600', color: Colors.surface },

  // Cost card
  costCard: { marginBottom: Spacing.lg, gap: 0 },
  costWarning: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 4,
    backgroundColor: Colors.border, borderRadius: BorderRadius.sm,
    padding: Spacing.sm, marginBottom: Spacing.sm,
  },
  costWarningText: { ...Typography.caption, color: Colors.textSecondary, flex: 1, lineHeight: 16 },
  costTitle: {
    ...Typography.label, color: Colors.textSecondary, fontWeight: '700',
    letterSpacing: 0.5, marginBottom: Spacing.sm,
  },
  costGroupLabel: {
    ...Typography.caption, color: Colors.textMuted, fontWeight: '600',
    letterSpacing: 0.4, marginBottom: 4, marginTop: 2,
  },
  costSection: { gap: 6, marginBottom: 4 },
  costRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 3,
  },
  costLabel: { ...Typography.bodySmall, color: Colors.textSecondary, flex: 1, paddingRight: Spacing.sm },
  costValue: { ...Typography.bodySmall, color: Colors.text, textAlign: 'right' },
  costDivider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.sm },
  costPct: { ...Typography.caption, color: Colors.success },
});
