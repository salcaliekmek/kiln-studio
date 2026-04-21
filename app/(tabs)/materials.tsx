import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, TextInput, Modal, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../../src/constants/theme';
import { Card } from '../../src/components/Card';
import { Badge } from '../../src/components/Badge';
import { EmptyState } from '../../src/components/EmptyState';
import {
  getMaterials, addMaterial, deleteMaterial, getPurchases, addPurchase, getMaterialConsumptions,
} from '../../src/services/materials';
import { Material, MaterialConsumption, MaterialType, MaterialUnit, Purchase } from '../../src/types';

const TYPE_LABELS: Record<MaterialType, string> = {
  clay: 'Çamur',
  pigment: 'Pigment',
  glaze: 'Sır',
  decal: 'Dekal',
  other: 'Diğer',
};

const TYPE_COLORS: Record<MaterialType, string> = {
  clay: Colors.stages.casting,
  pigment: Colors.stages.decal,
  glaze: Colors.stages.glazing,
  decal: Colors.stages.decal_firing,
  other: Colors.textMuted,
};

const UNIT_OPTIONS: MaterialUnit[] = ['gr', 'kg', 'lt', 'ml', 'adet'];
const TYPE_OPTIONS: MaterialType[] = ['clay', 'pigment', 'glaze', 'decal', 'other'];

function MaterialCard({ item, onPress, onPurchase }: { item: Material; onPress: () => void; onPurchase: () => void }) {
  const isLow = item.stock_quantity < 100;
  return (
    <Card style={styles.materialCard} onPress={onPress}>
      <View style={styles.materialHeader}>
        <View style={styles.materialLeft}>
          <Text style={styles.materialName}>{item.name}</Text>
          <Badge label={TYPE_LABELS[item.type]} color={TYPE_COLORS[item.type]} size="sm" />
        </View>
        <TouchableOpacity style={styles.purchaseBtn} onPress={onPurchase}>
          <Ionicons name="add-circle" size={26} color={Colors.accent} />
        </TouchableOpacity>
      </View>
      <View style={styles.materialFooter}>
        <View style={styles.stockInfo}>
          <Ionicons
            name={isLow ? 'warning' : 'checkmark-circle'}
            size={14}
            color={isLow ? Colors.error : Colors.success}
          />
          <Text style={[styles.stockText, isLow && { color: Colors.error }]}>
            {item.stock_quantity.toLocaleString('tr-TR')} {item.unit}
          </Text>
        </View>
        <Text style={styles.costText}>
          ₺{item.cost_per_unit.toFixed(2)}/{item.unit}
        </Text>
      </View>
    </Card>
  );
}

export default function MaterialsScreen() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [filterType, setFilterType] = useState<MaterialType | 'all'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [consumptions, setConsumptions] = useState<MaterialConsumption[]>([]);

  // Form state - add material
  const [form, setForm] = useState({ name: '', type: 'clay' as MaterialType, unit: 'gr' as MaterialUnit, cost_per_unit: '', notes: '' });

  // Form state - purchase
  const [purchaseForm, setPurchaseForm] = useState({ quantity: '', total_cost: '', supplier: '', notes: '' });

  const load = useCallback(async () => {
    const data = await getMaterials(filterType === 'all' ? undefined : filterType);
    setMaterials(data);
  }, [filterType]);

  useEffect(() => { load(); }, [load]);

  async function handleAddMaterial() {
    if (!form.name.trim()) return Alert.alert('Hata', 'Hammadde adı gerekli');
    try {
      await addMaterial({
        name: form.name.trim(),
        type: form.type,
        unit: form.unit,
        stock_quantity: 0,
        cost_per_unit: parseFloat(form.cost_per_unit) || 0,
        notes: form.notes || undefined,
      });
      setShowAddModal(false);
      setForm({ name: '', type: 'clay', unit: 'gr', cost_per_unit: '', notes: '' });
      load();
    } catch (e) {
      Alert.alert('Hata', 'Hammadde eklenemedi');
    }
  }

  async function handlePurchase() {
    if (!selectedMaterial) return;
    const qty = parseFloat(purchaseForm.quantity);
    const cost = parseFloat(purchaseForm.total_cost);
    if (!qty || !cost) return Alert.alert('Hata', 'Miktar ve toplam maliyet gerekli');
    try {
      await addPurchase({
        material_id: selectedMaterial.id,
        quantity: qty,
        total_cost: cost,
        purchase_date: new Date().toISOString().split('T')[0],
        supplier: purchaseForm.supplier || undefined,
        notes: purchaseForm.notes || undefined,
      });
      setShowPurchaseModal(false);
      setPurchaseForm({ quantity: '', total_cost: '', supplier: '', notes: '' });
      load();
      Alert.alert('Başarılı', `${qty} ${selectedMaterial.unit} ${selectedMaterial.name} stoka eklendi`);
    } catch (e) {
      Alert.alert('Hata', 'Satın alma kaydedilemedi');
    }
  }

  async function openDetail(material: Material) {
    setSelectedMaterial(material);
    const [purchaseData, consumptionData] = await Promise.all([
      getPurchases(material.id),
      getMaterialConsumptions(material.id, material.unit),
    ]);
    setPurchases(purchaseData);
    setConsumptions(consumptionData);
    setShowDetailModal(true);
  }

  function openPurchase(material: Material) {
    setSelectedMaterial(material);
    setPurchaseForm({ quantity: '', total_cost: '', supplier: '', notes: '' });
    setShowPurchaseModal(true);
  }

  function handleDelete(material: Material) {
    Alert.alert(
      'Hammadde Sil',
      `"${material.name}" silinsin mi?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil', style: 'destructive',
          onPress: async () => {
            await deleteMaterial(material.id);
            setShowDetailModal(false);
            load();
          },
        },
      ]
    );
  }

  const filtered = filterType === 'all' ? materials : materials.filter(m => m.type === filterType);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Hammadde</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
          <Ionicons name="add" size={22} color={Colors.surface} />
        </TouchableOpacity>
      </View>

      {/* Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterContent}>
        {(['all', ...TYPE_OPTIONS] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.filterChip, filterType === t && styles.filterChipActive]}
            onPress={() => setFilterType(t)}
          >
            <Text style={[styles.filterText, filterType === t && styles.filterTextActive]}>
              {t === 'all' ? 'Tümü' : TYPE_LABELS[t]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id.toString()}
        renderItem={({ item }) => (
          <MaterialCard
            item={item}
            onPress={() => openDetail(item)}
            onPurchase={() => openPurchase(item)}
          />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState icon="layers-outline" title="Hammadde bulunamadı" subtitle="Yeni hammadde eklemek için + butonuna dokunun" />
        }
      />

      {/* Add Material Modal */}
      <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet" onDismiss={() => setShowAddModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Yeni Hammadde</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <FormField label="Ad">
                <TextInput style={styles.input} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} placeholder="Hammadde adı" placeholderTextColor={Colors.textMuted} />
              </FormField>

              <FormField label="Tür">
                <View style={styles.optionRow}>
                  {TYPE_OPTIONS.map(t => (
                    <TouchableOpacity key={t} style={[styles.optionChip, form.type === t && styles.optionChipActive]} onPress={() => setForm(f => ({ ...f, type: t }))}>
                      <Text style={[styles.optionText, form.type === t && styles.optionTextActive]}>{TYPE_LABELS[t]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </FormField>

              <FormField label="Birim">
                <View style={styles.optionRow}>
                  {UNIT_OPTIONS.map(u => (
                    <TouchableOpacity key={u} style={[styles.optionChip, form.unit === u && styles.optionChipActive]} onPress={() => setForm(f => ({ ...f, unit: u }))}>
                      <Text style={[styles.optionText, form.unit === u && styles.optionTextActive]}>{u}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </FormField>

              <FormField label="Birim Maliyet (₺)">
                <TextInput style={styles.input} value={form.cost_per_unit} onChangeText={v => setForm(f => ({ ...f, cost_per_unit: v }))} placeholder="0.00" keyboardType="decimal-pad" placeholderTextColor={Colors.textMuted} />
              </FormField>

              <FormField label="Notlar (opsiyonel)">
                <TextInput style={[styles.input, styles.textarea]} value={form.notes} onChangeText={v => setForm(f => ({ ...f, notes: v }))} placeholder="Açıklama..." multiline numberOfLines={3} placeholderTextColor={Colors.textMuted} />
              </FormField>
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAddMaterial}>
                <Text style={styles.saveBtnText}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Purchase Modal */}
      <Modal visible={showPurchaseModal} animationType="slide" presentationStyle="pageSheet" onDismiss={() => setShowPurchaseModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Satın Alma</Text>
              <TouchableOpacity onPress={() => setShowPurchaseModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            {selectedMaterial && (
              <View style={styles.selectedMaterial}>
                <Badge label={TYPE_LABELS[selectedMaterial.type]} color={TYPE_COLORS[selectedMaterial.type]} size="sm" />
                <Text style={styles.selectedName}>{selectedMaterial.name}</Text>
              </View>
            )}
            <ScrollView style={styles.modalBody}>
              <FormField label={`Miktar (${selectedMaterial?.unit})`}>
                <TextInput style={styles.input} value={purchaseForm.quantity} onChangeText={v => setPurchaseForm(f => ({ ...f, quantity: v }))} placeholder="0" keyboardType="decimal-pad" placeholderTextColor={Colors.textMuted} />
              </FormField>
              <FormField label="Toplam Maliyet (₺)">
                <TextInput style={styles.input} value={purchaseForm.total_cost} onChangeText={v => setPurchaseForm(f => ({ ...f, total_cost: v }))} placeholder="0.00" keyboardType="decimal-pad" placeholderTextColor={Colors.textMuted} />
              </FormField>
              {purchaseForm.quantity && purchaseForm.total_cost && (
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>Birim fiyat: </Text>
                  <Text style={styles.calcValue}>₺{(parseFloat(purchaseForm.total_cost) / parseFloat(purchaseForm.quantity)).toFixed(2)}/{selectedMaterial?.unit}</Text>
                </View>
              )}
              <FormField label="Tedarikçi">
                <TextInput style={styles.input} value={purchaseForm.supplier} onChangeText={v => setPurchaseForm(f => ({ ...f, supplier: v }))} placeholder="Tedarikçi adı (opsiyonel)" placeholderTextColor={Colors.textMuted} />
              </FormField>
              <FormField label="Notlar">
                <TextInput style={[styles.input, styles.textarea]} value={purchaseForm.notes} onChangeText={v => setPurchaseForm(f => ({ ...f, notes: v }))} placeholder="Açıklama..." multiline numberOfLines={3} placeholderTextColor={Colors.textMuted} />
              </FormField>
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.saveBtn} onPress={handlePurchase}>
                <Text style={styles.saveBtnText}>Stoka Ekle</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Detail Modal */}
      <Modal visible={showDetailModal} animationType="slide" presentationStyle="pageSheet" onDismiss={() => setShowDetailModal(false)}>
        <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{selectedMaterial?.name}</Text>
            <TouchableOpacity onPress={() => setShowDetailModal(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>
          {selectedMaterial && (
            <ScrollView style={styles.modalBody}>
              <Card variant="filled" style={styles.detailCard}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Tür</Text>
                  <Badge label={TYPE_LABELS[selectedMaterial.type]} color={TYPE_COLORS[selectedMaterial.type]} size="sm" />
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Stok</Text>
                  <Text style={styles.detailValue}>{selectedMaterial.stock_quantity.toLocaleString('tr-TR')} {selectedMaterial.unit}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Birim Maliyet</Text>
                  <Text style={styles.detailValue}>₺{selectedMaterial.cost_per_unit.toFixed(2)}/{selectedMaterial.unit}</Text>
                </View>
                {selectedMaterial.notes && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Not</Text>
                    <Text style={styles.detailValue}>{selectedMaterial.notes}</Text>
                  </View>
                )}
              </Card>

              <Text style={styles.sectionLabel}>Satın Alma Geçmişi</Text>
              {purchases.length === 0 ? (
                <Text style={styles.emptyText}>Henüz satın alma kaydı yok</Text>
              ) : (
                purchases.map(p => (
                  <Card key={p.id} style={styles.purchaseCard} variant="outlined">
                    <View style={styles.purchaseRow}>
                      <Text style={styles.purchaseDate}>{p.purchase_date}</Text>
                      <Text style={styles.purchaseAmount}>+{p.quantity} {selectedMaterial.unit}</Text>
                    </View>
                    <View style={styles.purchaseRow}>
                      <Text style={styles.purchaseSupplier}>{p.supplier || '—'}</Text>
                      <Text style={styles.purchaseCost}>₺{p.total_cost.toLocaleString('tr-TR')}</Text>
                    </View>
                  </Card>
                ))
              )}

              <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>Tüketim Geçmişi</Text>
              {consumptions.length === 0 ? (
                <Text style={styles.emptyText}>Henüz tüketim kaydı yok</Text>
              ) : (
                consumptions.map(c => (
                  <Card key={c.id} style={styles.purchaseCard} variant="outlined">
                    <View style={styles.purchaseRow}>
                      <Text style={styles.purchaseDate}>{c.date}</Text>
                      <Text style={styles.consumptionAmount}>
                        -{c.quantity.toLocaleString('tr-TR')} {c.unit}
                      </Text>
                    </View>
                    <View style={styles.purchaseRow}>
                      <Text style={styles.purchaseSupplier}>{c.source}</Text>
                      <View style={styles.consumptionBadge}>
                        <Text style={styles.consumptionBadgeText}>
                          {c.source_type === 'liquid_clay' ? 'Sıvı Çamur' : 'Üretim'}
                        </Text>
                      </View>
                    </View>
                  </Card>
                ))
              )}
            </ScrollView>
          )}
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => selectedMaterial && handleDelete(selectedMaterial)}>
              <Ionicons name="trash-outline" size={18} color={Colors.error} />
              <Text style={styles.deleteBtnText}>Sil</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={() => {
              setShowDetailModal(false);
              if (selectedMaterial) openPurchase(selectedMaterial);
            }}>
              <Text style={styles.saveBtnText}>Satın Al</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      {children}
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

  filterBar: { maxHeight: 48 },
  filterContent: { paddingHorizontal: Spacing.md, gap: Spacing.xs, alignItems: 'center' },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: BorderRadius.full, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { ...Typography.bodySmall, color: Colors.textSecondary, fontWeight: '500' },
  filterTextActive: { color: Colors.surface },

  list: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xl },

  materialCard: { gap: Spacing.sm },
  materialHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  materialLeft: { gap: 4 },
  materialName: { ...Typography.body, fontWeight: '600', color: Colors.text },
  purchaseBtn: { padding: 2 },
  materialFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stockInfo: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stockText: { ...Typography.bodySmall, color: Colors.textSecondary },
  costText: { ...Typography.bodySmall, color: Colors.textMuted },

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

  selectedMaterial: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceVariant,
  },
  selectedName: { ...Typography.body, fontWeight: '600', color: Colors.text },

  formField: { marginBottom: Spacing.md },
  formLabel: { ...Typography.label, color: Colors.textSecondary, marginBottom: 6 },
  input: {
    ...Typography.body, color: Colors.text,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, paddingVertical: 12,
  },
  textarea: { height: 80, textAlignVertical: 'top' },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  optionChip: {
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  optionChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  optionText: { ...Typography.bodySmall, color: Colors.textSecondary },
  optionTextActive: { color: Colors.surface },

  calcRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  calcLabel: { ...Typography.bodySmall, color: Colors.textSecondary },
  calcValue: { ...Typography.bodySmall, fontWeight: '600', color: Colors.text },

  saveBtn: {
    flex: 1, backgroundColor: Colors.primary, borderRadius: BorderRadius.sm,
    paddingVertical: 14, alignItems: 'center',
  },
  saveBtnText: { ...Typography.body, fontWeight: '600', color: Colors.surface },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: Colors.error, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
  },
  deleteBtnText: { ...Typography.body, color: Colors.error, fontWeight: '600' },

  detailCard: { gap: Spacing.sm, marginBottom: Spacing.lg },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { ...Typography.bodySmall, color: Colors.textSecondary },
  detailValue: { ...Typography.bodySmall, color: Colors.text, fontWeight: '500', flex: 1, textAlign: 'right' },

  sectionLabel: { ...Typography.label, color: Colors.textSecondary, marginBottom: Spacing.sm },
  emptyText: { ...Typography.body, color: Colors.textMuted, textAlign: 'center', padding: Spacing.lg },

  purchaseCard: { marginBottom: Spacing.sm, gap: 4 },
  purchaseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  purchaseDate: { ...Typography.bodySmall, color: Colors.textSecondary },
  purchaseAmount: { ...Typography.bodySmall, fontWeight: '600', color: Colors.success },
  purchaseSupplier: { ...Typography.caption, color: Colors.textMuted, flex: 1 },
  purchaseCost: { ...Typography.caption, color: Colors.textSecondary },

  consumptionAmount: { ...Typography.bodySmall, fontWeight: '600', color: Colors.error },
  consumptionBadge: {
    backgroundColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  consumptionBadgeText: { ...Typography.caption, color: Colors.textSecondary },
});
