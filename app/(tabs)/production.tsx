import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, TextInput, Modal, ScrollView, KeyboardAvoidingView, Platform, DimensionValue,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Colors, Spacing, Typography, BorderRadius } from '../../src/constants/theme';
import { Card } from '../../src/components/Card';
import { EmptyState } from '../../src/components/EmptyState';
import { StageBadge, STAGE_LABELS } from '../../src/components/StageBadge';
import {
  getProductionBatches, addProductionBatch, addProductionItemToBatch, getActiveProductionItems,
  updateProductionItemStage, revertProductionItemStage, getProductionBatch, deleteProductionBatch,
  updateProductionBatch, getProductionItemCostLines, ProductionCostLine,
} from '../../src/services/production';
import { getProducts } from '../../src/services/products';
import { getMaterials } from '../../src/services/materials';
import { getLiquidClayBatches } from '../../src/services/liquidClay';
import { getProfile } from '../../src/services/settings';
import { ProductionBatch, ProductionItem, ProductionStage, Product, Material, LiquidClayBatch } from '../../src/types';

const ALL_STAGES: ProductionStage[] = [
  'casting', 'drying', 'bisque', 'bisque_done',
  'glazing', 'glaze_firing',
  'decal', 'decal_firing', 'sanding', 'finished',
];

export default function ProductionScreen() {
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [activeItems, setActiveItems] = useState<ProductionItem[]>([]);
  const [view, setView] = useState<'batches' | 'active'>('active');
  const [showNewBatch, setShowNewBatch] = useState(false);
  const [showBatchDetail, setShowBatchDetail] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<ProductionBatch | null>(null);
  const [editingBatch, setEditingBatch] = useState(false);
  const [itemCostLines, setItemCostLines] = useState<Record<number, ProductionCostLine[]>>({});
  const [editBatchNotes, setEditBatchNotes] = useState('');
  const [editBatchDate, setEditBatchDate] = useState('');
  // Mevcut partiye kalem ekleme
  const [showBatchEditAddItem, setShowBatchEditAddItem] = useState(false);
  const [batchEditProduct, setBatchEditProduct] = useState<Product | null>(null);
  const [batchEditLiquidClay, setBatchEditLiquidClay] = useState<LiquidClayBatch | null>(null);
  const [batchEditGlaze, setBatchEditGlaze] = useState<Material | null>(null);
  const [batchEditQty, setBatchEditQty] = useState('1');
  const [products, setProducts] = useState<Product[]>([]);
  const [glazeMaterials, setGlazeMaterials] = useState<Material[]>([]);
  const [liquidClayBatches, setLiquidClayBatches] = useState<LiquidClayBatch[]>([]);
  const [activeStages, setActiveStages] = useState<ProductionStage[]>([...ALL_STAGES]);

  // New batch form
  const [batchNotes, setBatchNotes] = useState('');
  const [batchItems, setBatchItems] = useState<Array<{
    product_id: number;
    liquid_clay_batch_id?: number;
    glaze_material_id?: number;
    quantity: number;
    product_name: string;
    clay_name?: string;
    glaze_name?: string;
  }>>([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedLiquidClay, setSelectedLiquidClay] = useState<LiquidClayBatch | null>(null);
  const [selectedGlaze, setSelectedGlaze] = useState<Material | null>(null);
  const [itemQty, setItemQty] = useState('1');

  const load = useCallback(async () => {
    const [b, active, prods, glazes, lcBatches, profile] = await Promise.all([
      getProductionBatches(),
      getActiveProductionItems(),
      getProducts(),
      getMaterials('glaze'),
      getLiquidClayBatches(),
      getProfile(),
    ]);
    setBatches(b);
    setActiveItems(active);
    setProducts(prods);
    setGlazeMaterials(glazes);
    setLiquidClayBatches(lcBatches);
    setActiveStages(profile.active_stages);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleCreateBatch() {
    if (batchItems.length === 0) return Alert.alert('Hata', 'En az bir ürün ekleyin');
    try {
      await addProductionBatch(
        { date_started: new Date().toISOString().split('T')[0], notes: batchNotes || undefined },
        batchItems.map(i => ({
          product_id: i.product_id,
          liquid_clay_batch_id: i.liquid_clay_batch_id,
          glaze_material_id: i.glaze_material_id,
          quantity: i.quantity,
        }))
      );
      setShowNewBatch(false);
      setBatchNotes('');
      setBatchItems([]);
      load();
    } catch (e) {
      Alert.alert('Hata', 'Üretim partisi oluşturulamadı');
    }
  }

  function showProductPicker() {
    if (products.length === 0) return Alert.alert('Uyarı', 'Henüz ürün tanımlanmamış');
    Alert.alert('Ürün Seç', '', [
      ...products.map(p => ({
        text: `${p.name} (${p.collection})`,
        onPress: () => setSelectedProduct(p),
      })),
      { text: 'İptal', style: 'cancel' as const },
    ]);
  }

  function showLiquidClayPicker() {
    const available = liquidClayBatches.filter(b => b.available_quantity > 0);
    if (available.length === 0) return Alert.alert('Uyarı', 'Kullanılabilir sıvı çamur partisi yok');
    Alert.alert('Sıvı Çamur Partisi', '', [
      ...available.map(b => ({
        text: `${b.name}  (${(b.available_quantity / 1000).toFixed(1)} kg)`,
        onPress: () => setSelectedLiquidClay(b),
      })),
      { text: 'İptal', style: 'cancel' as const },
    ]);
  }

  function showGlazePicker() {
    Alert.alert('Sır Seçimi', '', [
      {
        text: 'Sırsız / Sonra Seçilecek',
        onPress: () => setSelectedGlaze(null),
      },
      ...glazeMaterials.map(g => ({
        text: `${g.name}  ₺${g.cost_per_unit}/${g.unit}`,
        onPress: () => setSelectedGlaze(g),
      })),
      { text: 'İptal', style: 'cancel' as const },
    ]);
  }

  function handleAddItem() {
    if (!selectedProduct) return Alert.alert('Hata', 'Ürün seçin');
    if (!selectedLiquidClay) return Alert.alert('Hata', 'Sıvı çamur partisi seçin');
    setBatchItems(prev => [...prev, {
      product_id: selectedProduct.id,
      liquid_clay_batch_id: selectedLiquidClay.id,
      glaze_material_id: selectedGlaze?.id,
      quantity: parseInt(itemQty) || 1,
      product_name: selectedProduct.name,
      clay_name: selectedLiquidClay.name,
      glaze_name: selectedGlaze?.name,
    }]);
    setSelectedProduct(null);
    setSelectedLiquidClay(null);
    setSelectedGlaze(null);
    setItemQty('1');
    setShowAddItem(false);
  }

  async function openBatch(batch: ProductionBatch) {
    const full = await getProductionBatch(batch.id);
    setSelectedBatch(full);
    setShowBatchDetail(true);
    if (full?.items?.length) {
      const lines: Record<number, ProductionCostLine[]> = {};
      await Promise.all(
        full.items.map(async item => {
          lines[item.id] = await getProductionItemCostLines(item.id);
        })
      );
      setItemCostLines(lines);
    }
  }

  async function handleStageChange(item: ProductionItem) {
    const currentIndex = ALL_STAGES.indexOf(item.current_stage);
    const nextStages = ALL_STAGES.slice(currentIndex + 1).filter(s => activeStages.includes(s));
    // Önceki aşama: currentIndex'in hemen öncesi (düzeltme amaçlı)
    const prevStage = currentIndex > 0 ? ALL_STAGES[currentIndex - 1] : null;

    const refreshBatch = async () => {
      load();
      if (showBatchDetail && selectedBatch) {
        const updated = await getProductionBatch(selectedBatch.id);
        setSelectedBatch(updated);
        const updatedLines = await getProductionItemCostLines(item.id);
        setItemCostLines(prev => ({ ...prev, [item.id]: updatedLines }));
      }
    };

    Alert.alert(
      'Aşama Güncelle',
      `"${item.product_name}" için yeni aşama seçin:`,
      [
        ...nextStages.slice(0, 5).map(stage => ({
          text: `→ ${STAGE_LABELS[stage]}`,
          onPress: async () => {
            await updateProductionItemStage(item.id, stage);
            await refreshBatch();
          },
        })),
        ...(prevStage ? [{
          text: `← Geri: ${STAGE_LABELS[prevStage]}`,
          onPress: async () => {
            await revertProductionItemStage(item.id, item.current_stage, prevStage);
            await refreshBatch();
          },
        }] : []),
        { text: 'İptal', style: 'cancel' },
      ]
    );
  }

  function handleDeleteBatch(batch: ProductionBatch) {
    Alert.alert('Partiyi Sil', 'Bu üretim partisi silinsin mi?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil', style: 'destructive',
        onPress: async () => {
          await deleteProductionBatch(batch.id);
          setShowBatchDetail(false);
          load();
        },
      },
    ]);
  }

  function openBatchEdit() {
    if (!selectedBatch) return;
    setEditBatchNotes(selectedBatch.notes ?? '');
    setEditBatchDate(selectedBatch.date_started);
    setShowBatchEditAddItem(false);
    setBatchEditProduct(null);
    setBatchEditLiquidClay(null);
    setBatchEditGlaze(null);
    setBatchEditQty('1');
    setEditingBatch(true);
  }

  function showBatchEditProductPicker() {
    if (products.length === 0) return Alert.alert('Uyarı', 'Henüz ürün tanımlanmamış');
    Alert.alert('Ürün Seç', '', [
      ...products.map(p => ({
        text: `${p.name} (${p.collection})`,
        onPress: () => setBatchEditProduct(p),
      })),
      { text: 'İptal', style: 'cancel' as const },
    ]);
  }

  function showBatchEditLiquidClayPicker() {
    const available = liquidClayBatches.filter(b => b.available_quantity > 0);
    if (available.length === 0) return Alert.alert('Uyarı', 'Kullanılabilir sıvı çamur partisi yok');
    Alert.alert('Sıvı Çamur Partisi', '', [
      ...available.map(b => ({
        text: `${b.name}  (${(b.available_quantity / 1000).toFixed(1)} kg)`,
        onPress: () => setBatchEditLiquidClay(b),
      })),
      { text: 'İptal', style: 'cancel' as const },
    ]);
  }

  function showBatchEditGlazePicker() {
    Alert.alert('Sır Seçimi', '', [
      { text: 'Sırsız / Sonra Seçilecek', onPress: () => setBatchEditGlaze(null) },
      ...glazeMaterials.map(g => ({
        text: `${g.name}  ₺${g.cost_per_unit}/${g.unit}`,
        onPress: () => setBatchEditGlaze(g),
      })),
      { text: 'İptal', style: 'cancel' as const },
    ]);
  }

  async function handleAddItemToBatch() {
    if (!selectedBatch) return;
    if (!batchEditProduct) return Alert.alert('Hata', 'Ürün seçin');
    if (!batchEditLiquidClay) return Alert.alert('Hata', 'Sıvı çamur partisi seçin');
    try {
      await addProductionItemToBatch(selectedBatch.id, {
        product_id: batchEditProduct.id,
        liquid_clay_batch_id: batchEditLiquidClay.id,
        glaze_material_id: batchEditGlaze?.id,
        quantity: parseInt(batchEditQty) || 1,
      });
      setBatchEditProduct(null);
      setBatchEditLiquidClay(null);
      setBatchEditGlaze(null);
      setBatchEditQty('1');
      setShowBatchEditAddItem(false);
      // Batch detayını ve maliyet satırlarını yenile
      const updated = await getProductionBatch(selectedBatch.id);
      setSelectedBatch(updated);
      if (updated?.items) {
        const lines: Record<number, ProductionCostLine[]> = { ...itemCostLines };
        for (const itm of updated.items) {
          if (!lines[itm.id]) {
            lines[itm.id] = await getProductionItemCostLines(itm.id);
          }
        }
        setItemCostLines(lines);
      }
      load();
    } catch (e) {
      Alert.alert('Hata', 'Kalem eklenemedi');
    }
  }

  async function handleSaveBatchEdit() {
    if (!selectedBatch) return;
    await updateProductionBatch(selectedBatch.id, {
      date_started: editBatchDate,
      notes: editBatchNotes || undefined,
    });
    const updated = await getProductionBatch(selectedBatch.id);
    setSelectedBatch(updated);
    setEditingBatch(false);
    load();
  }

  function stageProgress(stage: ProductionStage): number {
    return Math.round((ALL_STAGES.indexOf(stage) / (ALL_STAGES.length - 1)) * 100);
  }

  function batchProgress(batch: ProductionBatch): number {
    const items = batch.items ?? [];
    if (items.length === 0) return 0;
    const totalQty = items.reduce((s, i) => s + i.quantity, 0);
    const weightedSum = items.reduce((s, i) => s + stageProgress(i.current_stage) * i.quantity, 0);
    return Math.round(weightedSum / totalQty);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Üretim</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowNewBatch(true)}>
          <Ionicons name="add" size={22} color={Colors.surface} />
        </TouchableOpacity>
      </View>

      {/* View Toggle */}
      <View style={styles.toggle}>
        {(['active', 'batches'] as const).map(v => (
          <TouchableOpacity key={v} style={[styles.toggleBtn, view === v && styles.toggleBtnActive]} onPress={() => setView(v)}>
            <Text style={[styles.toggleText, view === v && styles.toggleTextActive]}>
              {v === 'active' ? 'Aktif Ürünler' : 'Partiler'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {view === 'active' ? (
        <FlatList
          data={activeItems}
          keyExtractor={item => item.id.toString()}
          renderItem={({ item }) => (
            <Card style={styles.itemCard} onPress={() => handleStageChange(item)}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemName}>{item.product_name}</Text>
                <View style={styles.qtyBadge}>
                  <Text style={styles.qtyText}>{item.quantity} adet</Text>
                </View>
              </View>
              {(item.liquid_clay_batch_name || item.color_recipe_name) && (
                <Text style={styles.colorName}>
                  {[item.liquid_clay_batch_name ?? item.color_recipe_name, item.glaze_material_name]
                    .filter(Boolean).join(' · ')}
                </Text>
              )}
              <View style={styles.itemFooter}>
                <StageBadge stage={item.current_stage} size="sm" />
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </View>
            </Card>
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState icon="construct-outline" title="Aktif üretim yok" subtitle="Yeni parti başlatmak için + butonuna dokunun" />
          }
        />
      ) : (
        <FlatList
          data={batches}
          keyExtractor={item => item.id.toString()}
          renderItem={({ item }) => {
            const pct = item.progress_pct ?? 0;
            const isDone = pct >= 100;
            return (
              <Card style={styles.batchCard} onPress={() => openBatch(item)}>
                <View style={styles.batchHeader}>
                  <Text style={styles.batchDate}>{item.date_started}</Text>
                  <View style={styles.batchHeaderRight}>
                    <Text style={[styles.batchPct, isDone && styles.batchPctDone]}>
                      %{Math.round(pct)}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                  </View>
                </View>
                {item.notes && <Text style={styles.batchNotes}>{item.notes}</Text>}
                <View style={styles.batchProgressBg}>
                  <View style={[
                    styles.batchProgressFill,
                    { width: `${pct}%` as DimensionValue },
                    isDone && { backgroundColor: Colors.success },
                  ]} />
                </View>
              </Card>
            );
          }}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState icon="list-outline" title="Üretim partisi yok" subtitle="Yeni parti başlatın" />
          }
        />
      )}

      {/* New Batch Modal */}
      <Modal visible={showNewBatch} animationType="slide" presentationStyle="pageSheet" onDismiss={() => setShowNewBatch(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Yeni Üretim Partisi</Text>
              <TouchableOpacity onPress={() => setShowNewBatch(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.fieldLabel}>Notlar</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={batchNotes}
                onChangeText={setBatchNotes}
                placeholder="Parti notları..."
                multiline
                placeholderTextColor={Colors.textMuted}
              />

              <View style={styles.itemsHeader}>
                <Text style={styles.fieldLabel}>Ürünler</Text>
                <TouchableOpacity onPress={() => setShowAddItem(prev => !prev)} style={styles.addItemBtn}>
                  <Ionicons name={showAddItem ? 'chevron-up' : 'add'} size={18} color={Colors.primary} />
                  <Text style={styles.addItemText}>{showAddItem ? 'Kapat' : 'Ekle'}</Text>
                </TouchableOpacity>
              </View>

              {showAddItem && (
                <Card variant="outlined" style={styles.inlineForm}>

                  {/* Ürün */}
                  <Text style={styles.inlineLabel}>Ürün</Text>
                  <TouchableOpacity style={styles.dropdownBtn} onPress={showProductPicker}>
                    <Text style={[styles.dropdownText, !selectedProduct && styles.dropdownPlaceholder]}>
                      {selectedProduct
                        ? `${selectedProduct.name}  (${selectedProduct.collection})`
                        : 'Ürün seçin...'}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
                  </TouchableOpacity>

                  {/* Sıvı Çamur */}
                  <Text style={[styles.inlineLabel, { marginTop: Spacing.sm }]}>Sıvı Çamur Partisi</Text>
                  <TouchableOpacity style={styles.dropdownBtn} onPress={showLiquidClayPicker}>
                    <Text style={[styles.dropdownText, !selectedLiquidClay && styles.dropdownPlaceholder]}>
                      {selectedLiquidClay
                        ? `${selectedLiquidClay.name}  (${(selectedLiquidClay.available_quantity / 1000).toFixed(1)} kg)`
                        : 'Çamur partisi seçin...'}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
                  </TouchableOpacity>

                  {/* Sır */}
                  <Text style={[styles.inlineLabel, { marginTop: Spacing.sm }]}>
                    Sır  <Text style={styles.optionalLabel}>— opsiyonel</Text>
                  </Text>
                  <TouchableOpacity style={styles.dropdownBtn} onPress={showGlazePicker}>
                    <Text style={[styles.dropdownText, !selectedGlaze && styles.dropdownPlaceholder]}>
                      {selectedGlaze
                        ? `${selectedGlaze.name}  (₺${selectedGlaze.cost_per_unit}/${selectedGlaze.unit})`
                        : 'Sırsız / Sonra Seçilecek'}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
                  </TouchableOpacity>

                  {/* Adet + Ekle */}
                  <Text style={[styles.inlineLabel, { marginTop: Spacing.sm }]}>Adet</Text>
                  <View style={styles.inlineRow}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginBottom: 0 }]}
                      value={itemQty}
                      onChangeText={setItemQty}
                      keyboardType="number-pad"
                      placeholderTextColor={Colors.textMuted}
                    />
                    <TouchableOpacity style={styles.inlineAddBtn} onPress={handleAddItem}>
                      <Text style={styles.inlineAddBtnText}>Ekle</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Tahmini çamur tüketimi */}
                  {(() => {
                    const prod = selectedProduct
                      ? products.find(p => p.id === selectedProduct.id)
                      : null;
                    const castingGr = prod?.casting_weight_gr;
                    const qty = parseInt(itemQty) || 1;
                    if (!castingGr || !selectedLiquidClay) return null;
                    const usedGr = castingGr * qty;
                    const remaining = selectedLiquidClay.available_quantity - usedGr;
                    return (
                      <View style={styles.clayHint}>
                        <Ionicons name="water-outline" size={13} color={Colors.info} />
                        <Text style={styles.clayHintText}>
                          {`~${usedGr.toLocaleString('tr-TR')}gr çamur kullanılacak`}
                          {remaining >= 0
                            ? ` · ${(remaining / 1000).toFixed(1)}kg kalan`
                            : ' · ⚠ yetersiz stok'}
                        </Text>
                      </View>
                    );
                  })()}
                </Card>
              )}

              {batchItems.map((item, i) => (
                <Card key={i} variant="outlined" style={styles.batchItemCard}>
                  <View style={styles.batchItemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.batchItemName}>{item.product_name}</Text>
                      {(item.clay_name || item.glaze_name) && (
                        <Text style={styles.batchItemColor}>
                          {[item.clay_name, item.glaze_name].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                    </View>
                    <View style={styles.batchItemRight}>
                      <Text style={styles.batchItemQty}>{item.quantity} adet</Text>
                      <TouchableOpacity onPress={() => setBatchItems(prev => prev.filter((_, idx) => idx !== i))}>
                        <Ionicons name="trash-outline" size={18} color={Colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </Card>
              ))}
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.saveBtn} onPress={handleCreateBatch}>
                <Text style={styles.saveBtnText}>Partiyi Başlat</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>


      {/* Batch Detail Modal */}
      <Modal visible={showBatchDetail} animationType="slide" presentationStyle="pageSheet"
        onDismiss={() => { setShowBatchDetail(false); setEditingBatch(false); }}>
        <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Parti Detayı</Text>
            <View style={styles.modalHeaderActions}>
              <TouchableOpacity onPress={openBatchEdit} style={styles.headerIconBtn}>
                <Ionicons name="pencil-outline" size={20} color={Colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowBatchDetail(false); setEditingBatch(false); }}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {selectedBatch && (
            <ScrollView style={styles.modalBody}>

              {/* Düzenleme formu */}
              {editingBatch ? (
                <Card variant="outlined" style={{ marginBottom: Spacing.md, gap: Spacing.sm }}>
                  <Text style={styles.fieldLabel}>Başlangıç Tarihi</Text>
                  <TextInput
                    style={[styles.input, { marginBottom: 0 }]}
                    value={editBatchDate}
                    onChangeText={setEditBatchDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Colors.textMuted}
                  />
                  <Text style={[styles.fieldLabel, { marginTop: Spacing.sm }]}>Notlar</Text>
                  <TextInput
                    style={[styles.input, styles.textarea, { marginBottom: 0 }]}
                    value={editBatchNotes}
                    onChangeText={setEditBatchNotes}
                    placeholder="Parti notları..."
                    multiline
                    placeholderTextColor={Colors.textMuted}
                  />
                  <View style={[styles.inlineRow, { marginTop: Spacing.sm }]}>
                    <TouchableOpacity
                      style={[styles.inlineAddBtn, { flex: 1, alignItems: 'center' }]}
                      onPress={handleSaveBatchEdit}
                    >
                      <Text style={styles.inlineAddBtnText}>Kaydet</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.inlineAddBtn, { flex: 1, alignItems: 'center', backgroundColor: Colors.surfaceVariant }]}
                      onPress={() => setEditingBatch(false)}
                    >
                      <Text style={[styles.inlineAddBtnText, { color: Colors.textSecondary }]}>İptal</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Yeni kalem ekleme */}
                  <View style={[styles.itemsHeader, { marginTop: Spacing.md }]}>
                    <Text style={styles.fieldLabel}>Ürün Ekle</Text>
                    <TouchableOpacity
                      onPress={() => setShowBatchEditAddItem(prev => !prev)}
                      style={styles.addItemBtn}
                    >
                      <Ionicons name={showBatchEditAddItem ? 'chevron-up' : 'add'} size={18} color={Colors.primary} />
                      <Text style={styles.addItemText}>{showBatchEditAddItem ? 'Kapat' : 'Ekle'}</Text>
                    </TouchableOpacity>
                  </View>

                  {showBatchEditAddItem && (
                    <Card variant="outlined" style={styles.inlineForm}>
                      <Text style={styles.inlineLabel}>Ürün</Text>
                      <TouchableOpacity style={styles.dropdownBtn} onPress={showBatchEditProductPicker}>
                        <Text style={[styles.dropdownText, !batchEditProduct && styles.dropdownPlaceholder]}>
                          {batchEditProduct ? `${batchEditProduct.name}  (${batchEditProduct.collection})` : 'Ürün seçin...'}
                        </Text>
                        <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
                      </TouchableOpacity>

                      <Text style={[styles.inlineLabel, { marginTop: Spacing.sm }]}>Sıvı Çamur Partisi</Text>
                      <TouchableOpacity style={styles.dropdownBtn} onPress={showBatchEditLiquidClayPicker}>
                        <Text style={[styles.dropdownText, !batchEditLiquidClay && styles.dropdownPlaceholder]}>
                          {batchEditLiquidClay
                            ? `${batchEditLiquidClay.name}  (${(batchEditLiquidClay.available_quantity / 1000).toFixed(1)} kg)`
                            : 'Çamur partisi seçin...'}
                        </Text>
                        <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
                      </TouchableOpacity>

                      <Text style={[styles.inlineLabel, { marginTop: Spacing.sm }]}>
                        Sır  <Text style={styles.optionalLabel}>— opsiyonel</Text>
                      </Text>
                      <TouchableOpacity style={styles.dropdownBtn} onPress={showBatchEditGlazePicker}>
                        <Text style={[styles.dropdownText, !batchEditGlaze && styles.dropdownPlaceholder]}>
                          {batchEditGlaze
                            ? `${batchEditGlaze.name}  (₺${batchEditGlaze.cost_per_unit}/${batchEditGlaze.unit})`
                            : 'Sırsız / Sonra Seçilecek'}
                        </Text>
                        <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
                      </TouchableOpacity>

                      <Text style={[styles.inlineLabel, { marginTop: Spacing.sm }]}>Adet</Text>
                      <View style={styles.inlineRow}>
                        <TextInput
                          style={[styles.input, { flex: 1, marginBottom: 0 }]}
                          value={batchEditQty}
                          onChangeText={setBatchEditQty}
                          keyboardType="number-pad"
                          placeholderTextColor={Colors.textMuted}
                        />
                        <TouchableOpacity style={styles.inlineAddBtn} onPress={handleAddItemToBatch}>
                          <Text style={styles.inlineAddBtnText}>Ekle</Text>
                        </TouchableOpacity>
                      </View>
                    </Card>
                  )}
                </Card>
              ) : (
                <>
                  <Text style={styles.batchDetailDate}>Başlangıç: {selectedBatch.date_started}</Text>
                  {selectedBatch.notes && <Text style={styles.batchNotes}>{selectedBatch.notes}</Text>}
                </>
              )}

              {/* Genel ilerleme */}
              {!editingBatch && (selectedBatch.items?.length ?? 0) > 0 && (
                <View style={styles.overallProgress}>
                  <View style={styles.overallProgressHeader}>
                    <Text style={styles.overallProgressLabel}>Genel İlerleme</Text>
                    <Text style={styles.overallProgressPct}>{batchProgress(selectedBatch)}%</Text>
                  </View>
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, { width: `${batchProgress(selectedBatch)}%` }]} />
                  </View>
                </View>
              )}

              <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>Ürünler</Text>
              {selectedBatch.items?.map(item => {
                const pct = stageProgress(item.current_stage);
                return (
                  <Card key={item.id} style={styles.itemCard} onPress={() => handleStageChange(item)}>
                    <View style={styles.itemHeader}>
                      <Text style={styles.itemName}>{item.product_name}</Text>
                      <View style={styles.qtyBadge}>
                        <Text style={styles.qtyText}>{item.quantity} adet</Text>
                      </View>
                    </View>
                    {(item.liquid_clay_batch_name || item.color_recipe_name || item.glaze_material_name) && (
                      <Text style={styles.colorName}>
                        {[item.liquid_clay_batch_name ?? item.color_recipe_name, item.glaze_material_name]
                          .filter(Boolean).join(' · ')}
                      </Text>
                    )}
                    {/* Kalem progress */}
                    <View style={styles.itemProgressRow}>
                      <View style={styles.itemProgressBg}>
                        <View style={[styles.itemProgressFill, { width: `${pct}%` }]} />
                      </View>
                      <Text style={styles.itemProgressPct}>{pct}%</Text>
                    </View>
                    <View style={styles.itemFooter}>
                      <StageBadge stage={item.current_stage} size="sm" />
                      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                    </View>
                    {/* Birikimli maliyet satırları */}
                    {(itemCostLines[item.id]?.length ?? 0) > 0 && (
                      <View style={styles.costLines}>
                        {itemCostLines[item.id].map(line => (
                          <View key={line.key} style={styles.costLine}>
                            <Text style={styles.costLineLabel}>{line.label}</Text>
                            {line.detail && (
                              <Text style={styles.costLineDetail}>{line.detail}</Text>
                            )}
                            <Text style={styles.costLineAmount}>
                              ₺{line.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </Text>
                          </View>
                        ))}
                        <View style={styles.costLineTotalRow}>
                          <Text style={styles.costLineTotalLabel}>Toplam</Text>
                          <Text style={styles.costLineTotalAmount}>
                            ₺{itemCostLines[item.id]
                              .reduce((s, l) => s + l.amount, 0)
                              .toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Text>
                        </View>
                      </View>
                    )}
                  </Card>
                );
              })}
            </ScrollView>
          )}
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => selectedBatch && handleDeleteBatch(selectedBatch)}>
              <Ionicons name="trash-outline" size={18} color={Colors.error} />
              <Text style={styles.deleteBtnText}>Sil</Text>
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
  toggle: {
    flexDirection: 'row', marginHorizontal: Spacing.md, marginBottom: Spacing.sm,
    backgroundColor: Colors.surfaceVariant, borderRadius: BorderRadius.sm, padding: 3,
  },
  toggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: BorderRadius.sm - 2 },
  toggleBtnActive: { backgroundColor: Colors.surface },
  toggleText: { ...Typography.bodySmall, color: Colors.textSecondary, fontWeight: '500' },
  toggleTextActive: { color: Colors.text, fontWeight: '600' },
  list: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xl, flexGrow: 1 },

  itemCard: { gap: Spacing.sm },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { ...Typography.body, fontWeight: '600', color: Colors.text, flex: 1 },
  qtyBadge: {
    backgroundColor: Colors.accentLight, borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
  },
  qtyText: { ...Typography.caption, fontWeight: '600', color: Colors.primaryLight },
  colorName: { ...Typography.caption, color: Colors.textSecondary },
  itemFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  batchCard: { gap: 4 },
  batchHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  batchHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  batchDate: { ...Typography.body, fontWeight: '600', color: Colors.text },
  batchPct: { ...Typography.bodySmall, fontWeight: '700', color: Colors.textSecondary },
  batchPctDone: { color: Colors.success },
  batchNotes: { ...Typography.bodySmall, color: Colors.textSecondary },
  batchProgressBg: {
    height: 3, backgroundColor: Colors.border,
    borderRadius: 2, overflow: 'hidden', marginTop: 2,
  },
  batchProgressFill: {
    height: '100%', backgroundColor: Colors.primary, borderRadius: 2,
  },
  batchDetailDate: { ...Typography.bodySmall, color: Colors.textSecondary, marginBottom: Spacing.xs },

  modalHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerIconBtn: { padding: 4 },

  overallProgress: {
    marginTop: Spacing.md, marginBottom: Spacing.xs,
    backgroundColor: Colors.surfaceVariant, borderRadius: BorderRadius.md,
    padding: Spacing.md, gap: Spacing.sm,
  },
  overallProgressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  overallProgressLabel: { ...Typography.label, color: Colors.textSecondary },
  overallProgressPct: { ...Typography.h2, color: Colors.primary },
  progressBg: { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 4 },

  itemProgressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  itemProgressBg: { flex: 1, height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  itemProgressFill: { height: '100%', backgroundColor: Colors.accent, borderRadius: 2 },
  itemProgressPct: { ...Typography.caption, color: Colors.textMuted, width: 30, textAlign: 'right' },

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
  },
  textarea: { height: 80, textAlignVertical: 'top' },

  itemsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  addItemBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addItemText: { ...Typography.bodySmall, color: Colors.primary, fontWeight: '600' },

  inlineForm: { marginBottom: Spacing.sm, padding: Spacing.sm },
  inlineLabel: { ...Typography.label, color: Colors.textSecondary, marginBottom: 4 },
  optionalLabel: { ...Typography.caption, color: Colors.textMuted, fontWeight: '400' },
  inlineRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  dropdownBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, paddingVertical: 12,
  },
  dropdownText: { ...Typography.body, color: Colors.text, flex: 1 },
  dropdownPlaceholder: { color: Colors.textMuted },
  inlineAddBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
  },
  inlineAddBtnText: { ...Typography.body, color: Colors.surface, fontWeight: '600' },

  clayHint: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: Spacing.sm, paddingHorizontal: 2,
  },
  clayHintText: { ...Typography.caption, color: Colors.info, flex: 1 },
  batchItemCard: { marginBottom: Spacing.xs },
  batchItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  batchItemName: { ...Typography.bodySmall, fontWeight: '600', color: Colors.text },
  batchItemColor: { ...Typography.caption, color: Colors.textSecondary },
  batchItemRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  batchItemQty: { ...Typography.bodySmall, color: Colors.textSecondary },

  selectList: { maxHeight: 200, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.sm },
  selectItem: { padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  selectItemActive: { backgroundColor: Colors.accentLight },
  selectText: { ...Typography.body, color: Colors.text },
  selectTextActive: { fontWeight: '600', color: Colors.primary },
  selectSubText: { color: Colors.textSecondary, fontWeight: '400' },

  costLines: {
    marginTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.xs,
    gap: 4,
  },
  costLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  costLineLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    flex: 1,
  },
  costLineDetail: {
    ...Typography.caption,
    color: Colors.textMuted,
    fontSize: 10,
  },
  costLineAmount: {
    ...Typography.caption,
    fontWeight: '600',
    color: Colors.text,
    minWidth: 64,
    textAlign: 'right',
  },
  costLineTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 3,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  costLineTotalLabel: {
    ...Typography.caption,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  costLineTotalAmount: {
    ...Typography.caption,
    fontWeight: '700',
    color: Colors.primary,
  },

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
});
