import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, TextInput, Modal, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../../src/constants/theme';
import { Card } from '../../src/components/Card';
import { EmptyState } from '../../src/components/EmptyState';
import {
  getLiquidClayBatches, addLiquidClayBatch, deleteLiquidClayBatch,
  calculateBatchCost, getLiquidClayBatch, recalculateLiquidClayBatch,
} from '../../src/services/liquidClay';
import { getMaterials } from '../../src/services/materials';
import { getColorRecipes } from '../../src/services/colors';
import { LiquidClayBatch, LiquidClayPigmentItem, Material, ColorRecipe } from '../../src/types';

export default function ClayScreen() {
  const [batches, setBatches] = useState<LiquidClayBatch[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [selected, setSelected] = useState<LiquidClayBatch | null>(null);
  const [clays, setClays] = useState<Material[]>([]);
  const [colorRecipes, setColorRecipes] = useState<ColorRecipe[]>([]);

  // Form
  const [selectedClay, setSelectedClay] = useState<Material | null>(null);
  const [clayQty, setClayQty] = useState('25000');     // gram
  const [waterQty, setWaterQty] = useState('10000');   // gram
  const [selectedRecipe, setSelectedRecipe] = useState<ColorRecipe | null>(null);
  const [batchName, setBatchName] = useState('');
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState<{
    total_cost: number;
    cost_per_kg: number;
    pigment_items: LiquidClayPigmentItem[];
    raw_weight_gr: number;
    rounded_weight_gr: number;
  } | null>(null);
  const [calculating, setCalculating] = useState(false);

  /** 500'e veya tam kg'a yuvarla (her zaman yukarı) */
  function roundWeight(gr: number): number {
    return Math.ceil(gr / 500) * 500;
  }

  const load = useCallback(async () => {
    const [b, c, r] = await Promise.all([
      getLiquidClayBatches(),
      getMaterials('clay'),
      getColorRecipes(),
    ]);
    setBatches(b);
    setClays(c);
    setColorRecipes(r);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Önizleme: çamur veya renk reçetesi değişince maliyeti hesapla
  useEffect(() => {
    if (!selectedClay || !clayQty) { setPreview(null); return; }
    const qty = parseFloat(clayQty);
    if (!qty) { setPreview(null); return; }

    setCalculating(true);
    calculateBatchCost(selectedClay.id, qty, selectedRecipe?.id)
      .then(result => {
        const pigmentGr = result.pigment_items.reduce((s, p) => s + p.quantity, 0);
        const raw_weight_gr = qty + (parseFloat(waterQty) || 0) + pigmentGr;
        const rounded_weight_gr = roundWeight(raw_weight_gr);
        const cost_per_kg = rounded_weight_gr > 0 ? (result.total_cost / rounded_weight_gr) * 1000 : 0;
        setPreview({ ...result, cost_per_kg, raw_weight_gr, rounded_weight_gr });
      })
      .finally(() => setCalculating(false));
  }, [selectedClay, clayQty, waterQty, selectedRecipe]);

  function showClayPicker() {
    if (clays.length === 0) return Alert.alert('Uyarı', 'Hammadde ekranından "çamur" tipinde malzeme ekleyin.');
    Alert.alert('Kuru Çamur Seç', '', [
      ...clays.map(m => ({
        text: `${m.name}  (${m.stock_quantity} ${m.unit} · ₺${m.cost_per_unit}/${m.unit})`,
        onPress: () => setSelectedClay(m),
      })),
      { text: 'İptal', style: 'cancel' as const },
    ]);
  }

  function showRecipePicker() {
    Alert.alert('Renk Reçetesi Seç', '', [
      { text: 'Beyaz / Renksiz', onPress: () => setSelectedRecipe(null) },
      ...colorRecipes.map(r => ({
        text: `${r.name}  (baz: ${r.base_clay_quantity}gr)`,
        onPress: () => setSelectedRecipe(r),
      })),
      { text: 'İptal', style: 'cancel' as const },
    ]);
  }

  function resetForm() {
    setSelectedClay(null);
    setClayQty('25000');
    setWaterQty('10000');
    setSelectedRecipe(null);
    setBatchName('');
    setNotes('');
    setPreview(null);
  }

  async function handleCreate() {
    if (!selectedClay) return Alert.alert('Hata', 'Çamur malzemesi seçin');
    const clay = parseFloat(clayQty);
    const water = parseFloat(waterQty) || 0;
    if (!clay) return Alert.alert('Hata', 'Çamur miktarı girin');
    if (!batchName.trim()) return Alert.alert('Hata', 'Parti adı girin');

    const costData = await calculateBatchCost(selectedClay.id, clay, selectedRecipe?.id);
    const pigmentGr = costData.pigment_items.reduce((s, p) => s + p.quantity, 0);
    const rawWeight = clay + water + pigmentGr;
    const totalWeight = roundWeight(rawWeight);
    const cost_per_kg = totalWeight > 0 ? (costData.total_cost / totalWeight) * 1000 : 0;

    try {
      await addLiquidClayBatch({
        name: batchName.trim(),
        clay_material_id: selectedClay.id,
        clay_quantity: clay,
        water_quantity: water,
        color_recipe_id: selectedRecipe?.id,
        total_weight: totalWeight,
        available_quantity: totalWeight,
        total_cost: costData.total_cost,
        cost_per_kg,
        notes: notes || undefined,
      });
      setShowNew(false);
      resetForm();
      load();
    } catch (e) {
      Alert.alert('Hata', 'Çamur partisi oluşturulamadı');
    }
  }

  async function openDetail(batch: LiquidClayBatch) {
    const full = await getLiquidClayBatch(batch.id);
    setSelected(full);
    setShowDetail(true);
  }

  function handleDelete(batch: LiquidClayBatch) {
    Alert.alert('Partiyi Sil', `"${batch.name}" silinsin mi?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil', style: 'destructive',
        onPress: async () => { await deleteLiquidClayBatch(batch.id); setShowDetail(false); load(); },
      },
    ]);
  }

  const availablePercent = (batch: LiquidClayBatch) =>
    batch.total_weight > 0 ? Math.round((batch.available_quantity / batch.total_weight) * 100) : 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Sıvı Çamur</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowNew(true)}>
          <Ionicons name="add" size={22} color={Colors.surface} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={batches}
        keyExtractor={item => item.id.toString()}
        renderItem={({ item }) => {
          const pct = availablePercent(item);
          const barColor = pct > 50 ? Colors.success : pct > 20 ? Colors.warning : Colors.error;
          const isEmpty = pct === 0;
          return (
            <Card style={isEmpty ? { ...styles.batchCard, ...styles.batchCardEmpty } : styles.batchCard} onPress={() => openDetail(item)}>
              {/* Başlık + yüzde + ok */}
              <View style={styles.batchHeader}>
                <Text style={[styles.batchName, isEmpty && styles.batchNameEmpty]}>{item.name}</Text>
                <View style={styles.batchHeaderRight}>
                  <Text style={[styles.batchPct, { color: barColor }]}>%{pct}</Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </View>
              </View>

              {/* İnce progress bar */}
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: barColor }]} />
              </View>

              {/* Alt bilgi */}
              <View style={styles.batchFooter}>
                <Text style={styles.batchMeta}>
                  {(item.available_quantity / 1000).toFixed(1)} / {(item.total_weight / 1000).toFixed(1)} kg
                  {item.color_recipe_name ? `  ·  ${item.color_recipe_name}` : ''}
                </Text>
                <Text style={styles.costText}>₺{item.cost_per_kg.toFixed(0)}/kg</Text>
              </View>
            </Card>
          );
        }}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="beaker-outline"
            title="Sıvı çamur partisi yok"
            subtitle="Üretim öncesi çamur hazırlamak için + butonuna dokunun"
          />
        }
      />

      {/* Yeni Parti Modal */}
      <Modal visible={showNew} animationType="slide" presentationStyle="pageSheet"
        onDismiss={() => { setShowNew(false); resetForm(); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Yeni Sıvı Çamur</Text>
              <TouchableOpacity onPress={() => { setShowNew(false); resetForm(); }}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">

              <Text style={styles.fieldLabel}>Parti Adı</Text>
              <TextInput
                style={styles.input}
                value={batchName}
                onChangeText={setBatchName}
                placeholder="örn. Parlament Mavi — Parti 1"
                placeholderTextColor={Colors.textMuted}
              />

              {/* Çamur seçimi */}
              <Text style={styles.fieldLabel}>Kuru Çamur</Text>
              <TouchableOpacity style={styles.dropdownBtn} onPress={showClayPicker}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dropdownText, !selectedClay && styles.dropdownPlaceholder]}>
                    {selectedClay ? selectedClay.name : 'Çamur seçin...'}
                  </Text>
                  {selectedClay && (
                    <Text style={styles.dropdownSub}>
                      Stok: {selectedClay.stock_quantity} {selectedClay.unit} · ₺{selectedClay.cost_per_unit}/{selectedClay.unit}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
              </TouchableOpacity>

              <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>Çamur Miktarı (gr)</Text>
              <TextInput
                style={styles.input}
                value={clayQty}
                onChangeText={setClayQty}
                keyboardType="decimal-pad"
                placeholder="25000"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={styles.fieldLabel}>Su Miktarı (gr)</Text>
              <TextInput
                style={styles.input}
                value={waterQty}
                onChangeText={setWaterQty}
                keyboardType="decimal-pad"
                placeholder="10000"
                placeholderTextColor={Colors.textMuted}
              />

              {/* Renk reçetesi */}
              <Text style={styles.fieldLabel}>Renk Reçetesi</Text>
              <TouchableOpacity style={styles.dropdownBtn} onPress={showRecipePicker}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dropdownText, !selectedRecipe && styles.dropdownPlaceholder]}>
                    {selectedRecipe ? selectedRecipe.name : 'Beyaz / Renksiz'}
                  </Text>
                  {selectedRecipe && (
                    <Text style={styles.dropdownSub}>Baz: {selectedRecipe.base_clay_quantity}gr</Text>
                  )}
                </View>
                <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
              </TouchableOpacity>

              {/* Maliyet önizlemesi */}
              {(selectedClay && parseFloat(clayQty) > 0) && (
                <Card variant="filled" style={styles.previewCard}>
                  <Text style={styles.previewTitle}>Maliyet Önizlemesi</Text>
                  {calculating ? (
                    <ActivityIndicator color={Colors.primary} />
                  ) : preview ? (
                    <>
                      {/* Ağırlık dökümü */}
                      <View style={styles.previewRow}>
                        <Text style={styles.previewLabel}>Çamur + Su</Text>
                        <Text style={styles.previewValue}>
                          {((parseFloat(clayQty) + (parseFloat(waterQty) || 0)) / 1000).toFixed(2)} kg
                        </Text>
                      </View>

                      {preview.pigment_items.length > 0 && (
                        <>
                          <View style={styles.previewRow}>
                            <Text style={styles.previewLabel}>Toplam Pigment</Text>
                            <Text style={styles.previewValue}>
                              {preview.pigment_items.reduce((s, p) => s + p.quantity, 0).toFixed(1)} gr
                            </Text>
                          </View>
                          {preview.pigment_items.map((p, i) => (
                            <View key={i} style={styles.pigmentRow}>
                              <Text style={styles.pigmentName}>{p.material_name}</Text>
                              <Text style={styles.pigmentQty}>{p.quantity.toFixed(1)}gr</Text>
                              <Text style={styles.pigmentCost}>₺{p.cost.toFixed(2)}</Text>
                            </View>
                          ))}
                        </>
                      )}

                      <View style={styles.previewRow}>
                        <Text style={styles.previewLabel}>Ham Toplam</Text>
                        <Text style={styles.previewValue}>
                          {(preview.raw_weight_gr / 1000).toFixed(3)} kg
                        </Text>
                      </View>
                      <View style={styles.previewRow}>
                        <Text style={[styles.previewLabel, { fontWeight: '600', color: Colors.text }]}>
                          Yuvarlanmış Ağırlık
                        </Text>
                        <Text style={[styles.previewValue, { color: Colors.primary }]}>
                          {(preview.rounded_weight_gr / 1000).toFixed(1)} kg
                          {preview.rounded_weight_gr !== preview.raw_weight_gr && (
                            <Text style={styles.roundNote}>
                              {' '}(+{(preview.rounded_weight_gr - preview.raw_weight_gr).toFixed(0)}gr)
                            </Text>
                          )}
                        </Text>
                      </View>

                      <View style={[styles.previewRow, styles.previewTotal]}>
                        <Text style={styles.previewTotalLabel}>Toplam Maliyet</Text>
                        <Text style={styles.previewTotalValue}>₺{preview.total_cost.toFixed(2)}</Text>
                      </View>
                      <View style={styles.previewRow}>
                        <Text style={styles.previewLabel}>Kg Başı Maliyet</Text>
                        <Text style={styles.previewValue}>₺{preview.cost_per_kg.toFixed(2)}/kg</Text>
                      </View>
                    </>
                  ) : null}
                </Card>
              )}

              <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>Notlar</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Opsiyonel..."
                multiline
                placeholderTextColor={Colors.textMuted}
              />
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.saveBtn} onPress={handleCreate}>
                <Text style={styles.saveBtnText}>Çamuru Hazırla</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Detay Modal */}
      <Modal visible={showDetail} animationType="slide" presentationStyle="pageSheet"
        onDismiss={() => setShowDetail(false)}>
        <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{selected?.name}</Text>
            <TouchableOpacity onPress={() => setShowDetail(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>
          {selected && (
            <ScrollView style={styles.modalBody}>
              <Card variant="filled" style={styles.detailCard}>
                <DetailRow label="Çamur" value={`${selected.clay_material_name} — ${(selected.clay_quantity / 1000).toFixed(1)}kg`} />
                <DetailRow label="Su" value={`${(selected.water_quantity / 1000).toFixed(1)}kg`} />
                <DetailRow label="Toplam Ağırlık" value={`${(selected.total_weight / 1000).toFixed(1)}kg`} />
                <DetailRow label="Kalan" value={`${(selected.available_quantity / 1000).toFixed(1)}kg`} />
                {selected.color_recipe_name && (
                  <DetailRow label="Renk Reçetesi" value={selected.color_recipe_name} />
                )}
                <DetailRow label="Toplam Maliyet" value={`₺${selected.total_cost.toFixed(2)}`} />
                <DetailRow label="Kg Başı Maliyet" value={`₺${selected.cost_per_kg.toFixed(2)}/kg`} />
              </Card>

              {selected.pigment_items && selected.pigment_items.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Ölçeklenmiş Pigment Miktarları</Text>
                  <Text style={styles.scaleNote}>
                    {(selected.clay_quantity / 1000).toFixed(1)}kg çamur için reçete ölçeklendi
                  </Text>
                  {selected.pigment_items.map((p, i) => (
                    <Card key={i} variant="outlined" style={styles.pigmentCard}>
                      <View style={styles.pigmentDetailRow}>
                        <Text style={styles.pigmentDetailName}>{p.material_name}</Text>
                        <Text style={styles.pigmentDetailQty}>{p.quantity.toFixed(1)}gr</Text>
                        <Text style={styles.pigmentDetailCost}>₺{p.cost.toFixed(2)}</Text>
                      </View>
                    </Card>
                  ))}
                </>
              )}

              {/* Kalan miktar çubuğu */}
              {(() => {
                const pct = selected.total_weight > 0
                  ? Math.round((selected.available_quantity / selected.total_weight) * 100) : 0;
                const barColor = pct > 50 ? Colors.success : pct > 20 ? Colors.warning : Colors.error;
                return (
                  <View style={{ marginTop: Spacing.md, gap: 6 }}>
                    <View style={styles.progressBg}>
                      <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: barColor }]} />
                    </View>
                    <Text style={[styles.batchMeta, { textAlign: 'right' }]}>
                      <Text style={{ color: barColor, fontWeight: '700' }}>%{pct} kaldı</Text>
                      {`  ·  ${(selected.available_quantity / 1000).toFixed(1)} / ${(selected.total_weight / 1000).toFixed(1)} kg`}
                    </Text>
                  </View>
                );
              })()}
            </ScrollView>
          )}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.recalcBtn}
              onPress={async () => {
                if (!selected) return;
                await recalculateLiquidClayBatch(selected.id);
                const updated = await getLiquidClayBatch(selected.id);
                setSelected(updated);
                load();
              }}
            >
              <Ionicons name="refresh-outline" size={18} color={Colors.primary} />
              <Text style={styles.recalcBtnText}>Yeniden Hesapla</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => selected && handleDelete(selected)}>
              <Ionicons name="trash-outline" size={18} color={Colors.error} />
              <Text style={styles.deleteBtnText}>Sil</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
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
  list: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xl },

  batchCard: { gap: 6 },
  batchCardEmpty: { opacity: 0.55 },
  batchHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  batchHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  batchName: { ...Typography.body, fontWeight: '600', color: Colors.text, flex: 1 },
  batchNameEmpty: { color: Colors.textSecondary },
  batchPct: { ...Typography.bodySmall, fontWeight: '700' },
  batchFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  batchMeta: { ...Typography.caption, color: Colors.textSecondary, flex: 1 },
  costText: { ...Typography.caption, fontWeight: '700', color: Colors.primary },

  progressBg: {
    height: 3, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2 },

  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: { ...Typography.h2, color: Colors.text },
  modalBody: { flex: 1, padding: Spacing.md },
  modalFooter: {
    flexDirection: 'row', gap: Spacing.sm,
    padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border,
  },

  fieldLabel: { ...Typography.label, color: Colors.textSecondary, marginBottom: 6 },
  input: {
    ...Typography.body, color: Colors.text,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, paddingVertical: 12,
    marginBottom: Spacing.md,
  },
  textarea: { height: 72, textAlignVertical: 'top' },
  hintText: { ...Typography.bodySmall, color: Colors.textMuted, marginBottom: Spacing.md },

  dropdownBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, paddingVertical: 12,
    marginBottom: Spacing.md, gap: Spacing.sm,
  },
  dropdownText: { ...Typography.body, color: Colors.text },
  dropdownPlaceholder: { color: Colors.textMuted },
  dropdownSub: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },

  previewCard: { marginBottom: Spacing.md, gap: Spacing.xs },
  previewTitle: { ...Typography.label, color: Colors.textSecondary, marginBottom: Spacing.xs },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewLabel: { ...Typography.bodySmall, color: Colors.textSecondary },
  previewValue: { ...Typography.bodySmall, fontWeight: '600', color: Colors.text },
  previewTotal: {
    marginTop: Spacing.sm, paddingTop: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  previewTotalLabel: { ...Typography.body, fontWeight: '600', color: Colors.text },
  previewTotalValue: { ...Typography.h3, color: Colors.primary },

  roundNote: { ...Typography.caption, color: Colors.textMuted },
  pigmentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  pigmentName: { ...Typography.bodySmall, color: Colors.text, flex: 1 },
  pigmentQty: { ...Typography.bodySmall, color: Colors.textSecondary, width: 70, textAlign: 'right' },
  pigmentCost: { ...Typography.bodySmall, color: Colors.textMuted, width: 70, textAlign: 'right' },

  saveBtn: {
    flex: 1, backgroundColor: Colors.primary, borderRadius: BorderRadius.sm,
    paddingVertical: 14, alignItems: 'center',
  },
  saveBtnText: { ...Typography.body, fontWeight: '600', color: Colors.surface },
  recalcBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: Colors.primary, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
  },
  recalcBtnText: { ...Typography.body, color: Colors.primary, fontWeight: '600' },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: Colors.error, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
  },
  deleteBtnText: { ...Typography.body, color: Colors.error, fontWeight: '600' },

  detailCard: { gap: Spacing.sm, marginBottom: Spacing.md },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { ...Typography.bodySmall, color: Colors.textSecondary },
  detailValue: { ...Typography.bodySmall, color: Colors.text, fontWeight: '500', flex: 1, textAlign: 'right' },

  sectionLabel: { ...Typography.label, color: Colors.textSecondary, marginBottom: 4, marginTop: Spacing.md },
  scaleNote: { ...Typography.caption, color: Colors.textMuted, marginBottom: Spacing.sm },
  pigmentCard: { marginBottom: Spacing.xs },
  pigmentDetailRow: { flexDirection: 'row', alignItems: 'center' },
  pigmentDetailName: { ...Typography.bodySmall, color: Colors.text, flex: 1 },
  pigmentDetailQty: { ...Typography.bodySmall, color: Colors.textSecondary, width: 70, textAlign: 'right' },
  pigmentDetailCost: { ...Typography.caption, color: Colors.textMuted, width: 60, textAlign: 'right' },
});
