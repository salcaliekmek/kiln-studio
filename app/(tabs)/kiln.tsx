import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity,
  Alert, TextInput, Modal, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../../src/constants/theme';
import { Card } from '../../src/components/Card';
import { Badge } from '../../src/components/Badge';
import { EmptyState } from '../../src/components/EmptyState';
import { getKilnFirings, addKilnFiring, updateKilnFiring, updateKilnFiringStatus, deleteKilnFiring, getKilnFiring, calculateFiringCost, FiringCostDetail } from '../../src/services/kiln';
import { getKilns } from '../../src/services/kilns';
import { getActiveProductionItems } from '../../src/services/production';
import { getProducts } from '../../src/services/products';
import { getColorRecipes } from '../../src/services/colors';
import { KilnFiring, KilnStatus, FiringType, ProductionItem, Kiln, Product, CustomKilnItem, ColorRecipe } from '../../src/types';

const FIRING_LABELS: Record<FiringType, string> = { bisque: 'Bisküvi', glaze: 'Ana Sır', decal: 'Dekal' };
const STATUS_LABELS: Record<KilnStatus, string> = { planned: 'Planlandı', firing: 'Fırında', done: 'Tamamlandı' };
const STATUS_COLORS: Record<KilnStatus, string> = {
  planned: Colors.info,
  firing: Colors.warning,
  done: Colors.success,
};
const FIRING_COLORS: Record<FiringType, string> = {
  bisque: Colors.firing.bisque,
  glaze: Colors.firing.glaze,
  decal: Colors.firing.decal,
};
const DEFAULT_TEMPS: Record<FiringType, number> = { bisque: 980, glaze: 1260, decal: 820 };
const FIRING_STAGE_FILTER: Record<FiringType, string[]> = {
  bisque: ['bisque'],
  glaze:  ['glaze_firing'],
  decal:  ['decal_firing'],
};

function FiringCard({ item, onPress }: { item: KilnFiring; onPress: () => void }) {
  return (
    <Card style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <View style={styles.tempRow}>
            <Ionicons name="flame" size={16} color={FIRING_COLORS[item.firing_type]} />
            <Text style={styles.tempText}>{item.temperature}°C</Text>
          </View>
          <Text style={styles.cardDate}>{item.date}</Text>
        </View>
        <View style={styles.cardRight}>
          <Badge label={FIRING_LABELS[item.firing_type]} color={FIRING_COLORS[item.firing_type]} size="sm" />
          <Badge label={STATUS_LABELS[item.status]} color={STATUS_COLORS[item.status]} size="sm" />
        </View>
      </View>
      {item.program_name && <Text style={styles.programName}>{item.program_name}</Text>}
      {item.duration_hours && <Text style={styles.duration}>{item.duration_hours} saat</Text>}
    </Card>
  );
}

export default function KilnScreen() {
  const [firings, setFirings] = useState<KilnFiring[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [selected, setSelected] = useState<KilnFiring | null>(null);
  const [firingCost, setFiringCost] = useState<FiringCostDetail | null>(null);
  const [activeItems, setActiveItems] = useState<ProductionItem[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [kilns, setKilns] = useState<Kiln[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [colorRecipes, setColorRecipes] = useState<ColorRecipe[]>([]);

  // Form state
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    program_name: '',
    temperature: '980',
    duration_hours: '',
    firing_type: 'bisque' as FiringType,
    notes: '',
    kiln_id: undefined as number | undefined,
  });
  const [selectedItems, setSelectedItems] = useState<Map<number, number>>(new Map());

  // "Diğer" custom items
  const [customItems, setCustomItems] = useState<CustomKilnItem[]>([]);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [pendingColorRecipe, setPendingColorRecipe] = useState<ColorRecipe | null>(null);
  const [pendingQty, setPendingQty] = useState(1);

  const load = useCallback(async () => {
    const [f, active, k, prods, cr] = await Promise.all([
      getKilnFirings(), getActiveProductionItems(), getKilns(), getProducts(), getColorRecipes(),
    ]);
    setFirings(f);
    setActiveItems(active);
    setKilns(k);
    setProducts(prods);
    setColorRecipes(cr);
  }, []);

  useEffect(() => { load(); }, [load]);

  function setFiringType(type: FiringType) {
    setForm(f => ({ ...f, firing_type: type, temperature: String(DEFAULT_TEMPS[type]) }));
  }

  function showKilnPicker() {
    if (kilns.length === 0) return Alert.alert('', 'Profil ekranından önce fırın tanımlayın');
    Alert.alert(
      'Fırın Seç',
      '',
      [
        ...kilns.map(k => ({
          text: `${k.name} — ${k.power_kw} kWh`,
          onPress: () => setForm(f => ({ ...f, kiln_id: k.id })),
        })),
        { text: 'Seçimi Kaldır', onPress: () => setForm(f => ({ ...f, kiln_id: undefined })) },
        { text: 'İptal', style: 'cancel' as const },
      ]
    );
  }

  async function handleCreate() {
    const temp = parseInt(form.temperature);
    if (!temp) return Alert.alert('Hata', 'Sıcaklık giriniz');
    const items = Array.from(selectedItems.entries())
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ production_item_id: id, quantity: qty }));

    try {
      await addKilnFiring(
        {
          date: form.date,
          program_name: form.program_name || undefined,
          temperature: temp,
          duration_hours: parseFloat(form.duration_hours) || undefined,
          firing_type: form.firing_type,
          status: 'planned',
          notes: form.notes || undefined,
          kiln_id: form.kiln_id,
          custom_items: customItems.length ? customItems : undefined,
        },
        items
      );
      setShowNew(false);
      resetForm();
      load();
    } catch {
      Alert.alert('Hata', 'Fırın kaydı oluşturulamadı');
    }
  }

  function resetForm() {
    setForm({
      date: new Date().toISOString().split('T')[0],
      program_name: '', temperature: '980', duration_hours: '',
      firing_type: 'bisque', notes: '', kiln_id: undefined,
    });
    setSelectedItems(new Map());
    setCustomItems([]);
    setPendingProduct(null);
    setPendingColorRecipe(null);
    setPendingQty(1);
    setShowProductPicker(false);
  }

  async function openDetail(firing: KilnFiring) {
    const [full, cost] = await Promise.all([
      getKilnFiring(firing.id),
      calculateFiringCost(firing.id),
    ]);
    setSelected(full);
    setFiringCost(cost);
    setIsEditing(false);
    setShowDetail(true);
  }

  function enterEditMode() {
    if (!selected) return;
    setForm({
      date: selected.date,
      program_name: selected.program_name ?? '',
      temperature: String(selected.temperature),
      duration_hours: selected.duration_hours ? String(selected.duration_hours) : '',
      firing_type: selected.firing_type,
      notes: selected.notes ?? '',
      kiln_id: selected.kiln_id,
    });
    const itemMap = new Map<number, number>();
    selected.items?.forEach(item => itemMap.set(item.production_item_id, item.quantity));
    setSelectedItems(itemMap);
    setCustomItems(selected.custom_items ?? []);
    setPendingProduct(null);
    setPendingColorRecipe(null);
    setPendingQty(1);
    setShowProductPicker(false);
    setIsEditing(true);
  }

  async function handleUpdate() {
    if (!selected) return;
    const temp = parseInt(form.temperature);
    if (!temp) return Alert.alert('Hata', 'Sıcaklık giriniz');
    const items = Array.from(selectedItems.entries())
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ production_item_id: id, quantity: qty }));
    try {
      await updateKilnFiring(
        selected.id,
        {
          date: form.date,
          program_name: form.program_name || undefined,
          temperature: temp,
          duration_hours: parseFloat(form.duration_hours) || undefined,
          firing_type: form.firing_type,
          status: selected.status,
          notes: form.notes || undefined,
          kiln_id: form.kiln_id,
          custom_items: customItems.length ? customItems : undefined,
        },
        items
      );
      const [refreshed, cost] = await Promise.all([
        getKilnFiring(selected.id),
        calculateFiringCost(selected.id),
      ]);
      setSelected(refreshed);
      setFiringCost(cost);
      setIsEditing(false);
      load();
    } catch {
      Alert.alert('Hata', 'Pişirim güncellenemedi');
    }
  }

  function handleStatusChange(firing: KilnFiring) {
    const nextStatuses: KilnStatus[] = firing.status === 'planned' ? ['firing', 'done'] : ['done'];
    Alert.alert('Durum Güncelle', 'Yeni durum seçin:', [
      ...nextStatuses.map(s => ({
        text: STATUS_LABELS[s],
        onPress: async () => {
          await updateKilnFiringStatus(firing.id, s);
          setSelected(prev => prev ? { ...prev, status: s } : prev);
          load();
        },
      })),
      { text: 'İptal', style: 'cancel' },
    ]);
  }

  function toggleItem(item: ProductionItem) {
    setSelectedItems(prev => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item.quantity);
      return next;
    });
  }

  function showProductPickerAlert() {
    if (products.length === 0) return Alert.alert('', 'Katalogda ürün yok');
    Alert.alert(
      'Ürün Seç',
      '',
      [
        ...products.map(p => ({
          text: `${p.name}  ·  ${p.collection} ${p.size}`,
          onPress: () => setPendingProduct(p),
        })),
        { text: 'İptal', style: 'cancel' as const },
      ]
    );
  }

  function showColorPickerAlert() {
    Alert.alert(
      'Renk Reçetesi',
      '',
      [
        { text: '— Renksiz / Belirsiz', onPress: () => setPendingColorRecipe(null) },
        ...colorRecipes.map(cr => ({
          text: cr.name,
          onPress: () => setPendingColorRecipe(cr),
        })),
        { text: 'İptal', style: 'cancel' as const },
      ]
    );
  }

  function confirmAddCustomItem() {
    if (!pendingProduct) return Alert.alert('', 'Ürün seçin');
    setCustomItems(prev => [...prev, {
      product_id: pendingProduct.id,
      product_name: pendingProduct.name,
      quantity: pendingQty,
      color_recipe_id: pendingColorRecipe?.id,
      color_recipe_name: pendingColorRecipe?.name,
    }]);
    setPendingProduct(null);
    setPendingColorRecipe(null);
    setPendingQty(1);
    // picker açık kalır — kullanıcı başka ürün ekleyebilir
  }

  function removeCustomItem(index: number) {
    setCustomItems(prev => prev.filter((_, i) => i !== index));
  }

  const selectedKiln = kilns.find(k => k.id === form.kiln_id);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Fırın</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowNew(true)}>
          <Ionicons name="add" size={22} color={Colors.surface} />
        </TouchableOpacity>
      </View>

      {(() => {
        const active = firings.filter(f => f.status !== 'done');
        const done   = firings.filter(f => f.status === 'done');

        const sections: { key: string; title: string; type?: FiringType; icon: string; data: KilnFiring[] }[] = [
          { key: 'bisque', title: 'Bisküvi Pişirimleri', type: 'bisque' as FiringType, icon: 'flame',
            data: active.filter(f => f.firing_type === 'bisque') },
          { key: 'glaze',  title: 'Sır Pişirimleri',    type: 'glaze'  as FiringType, icon: 'flame',
            data: active.filter(f => f.firing_type === 'glaze') },
          { key: 'decal',  title: 'Dekal Pişirimleri',  type: 'decal'  as FiringType, icon: 'flame',
            data: active.filter(f => f.firing_type === 'decal') },
          { key: 'done',   title: 'Tamamlananlar',       icon: 'checkmark-circle',
            data: showDone ? done : [] },
        ].filter(s => s.key === 'done' ? done.length > 0 : s.data.length > 0);

        if (firings.length === 0) {
          return <EmptyState icon="flame-outline" title="Fırın kaydı yok" subtitle="Yeni pişirim planlamak için + butonuna dokunun" />;
        }

        return (
          <SectionList
            sections={sections}
            keyExtractor={item => item.id.toString()}
            renderItem={({ item }) => <FiringCard item={item} onPress={() => openDetail(item)} />}
            renderSectionHeader={({ section }) => (
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={section.key === 'done' ? () => setShowDone(v => !v) : undefined}
                activeOpacity={section.key === 'done' ? 0.6 : 1}
              >
                <View style={styles.sectionHeaderLeft}>
                  <Ionicons
                    name={section.icon as any}
                    size={14}
                    color={section.type ? FIRING_COLORS[section.type] : Colors.success}
                  />
                  <Text style={[
                    styles.sectionTitle,
                    section.type && { color: FIRING_COLORS[section.type] },
                  ]}>
                    {section.title}
                  </Text>
                  {section.key !== 'done' && (
                    <View style={[styles.sectionBadge, { backgroundColor: FIRING_COLORS[section.type!] + '20' }]}>
                      <Text style={[styles.sectionBadgeText, { color: FIRING_COLORS[section.type!] }]}>
                        {section.data.length}
                      </Text>
                    </View>
                  )}
                  {section.key === 'done' && (
                    <View style={[styles.sectionBadge, { backgroundColor: Colors.success + '20' }]}>
                      <Text style={[styles.sectionBadgeText, { color: Colors.success }]}>
                        {done.length}
                      </Text>
                    </View>
                  )}
                </View>
                {section.key === 'done' && (
                  <Ionicons
                    name={showDone ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={Colors.textSecondary}
                  />
                )}
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.list}
            stickySectionHeadersEnabled={false}
          />
        );
      })()}

      {/* New Firing Modal */}
      <Modal visible={showNew} animationType="slide" presentationStyle="pageSheet"
        onDismiss={() => { setShowNew(false); resetForm(); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Yeni Pişirim</Text>
              <TouchableOpacity onPress={() => { setShowNew(false); resetForm(); }}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">

              {/* Fırın seçimi — tek dropdown butonu */}
              <Text style={styles.fieldLabel}>Fırın Seçimi</Text>
              <TouchableOpacity style={styles.dropdownBtn} onPress={showKilnPicker}>
                <Ionicons name="flame-outline" size={18}
                  color={selectedKiln ? Colors.warning : Colors.textMuted} />
                <Text style={[styles.dropdownText, selectedKiln && { color: Colors.text }]}>
                  {selectedKiln ? `${selectedKiln.name} — ${selectedKiln.power_kw} kWh` : 'Fırın seçin...'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* Pişirim tipi */}
              <Text style={styles.fieldLabel}>Pişirim Tipi</Text>
              <View style={styles.typeRow}>
                {(['bisque', 'glaze', 'decal'] as FiringType[]).map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeBtn, form.firing_type === t && { backgroundColor: FIRING_COLORS[t] + '30', borderColor: FIRING_COLORS[t] }]}
                    onPress={() => setFiringType(t)}
                  >
                    <Ionicons name="flame" size={16} color={form.firing_type === t ? FIRING_COLORS[t] : Colors.textMuted} />
                    <Text style={[styles.typeBtnText, form.firing_type === t && { color: FIRING_COLORS[t], fontWeight: '600' }]}>
                      {FIRING_LABELS[t]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Tarih</Text>
              <TextInput style={styles.input} value={form.date}
                onChangeText={v => setForm(f => ({ ...f, date: v }))}
                placeholder="YYYY-MM-DD" placeholderTextColor={Colors.textMuted} />

              <Text style={styles.fieldLabel}>Program Adı (opsiyonel)</Text>
              <TextInput style={styles.input} value={form.program_name}
                onChangeText={v => setForm(f => ({ ...f, program_name: v }))}
                placeholder="örn. P1, Standart Bisküvi..." placeholderTextColor={Colors.textMuted} />

              <Text style={styles.fieldLabel}>Sıcaklık (°C)</Text>
              <TextInput style={styles.input} value={form.temperature}
                onChangeText={v => setForm(f => ({ ...f, temperature: v }))}
                keyboardType="number-pad" placeholderTextColor={Colors.textMuted} />

              <Text style={styles.fieldLabel}>Süre (saat)</Text>
              <TextInput style={styles.input} value={form.duration_hours}
                onChangeText={v => setForm(f => ({ ...f, duration_hours: v }))}
                keyboardType="decimal-pad" placeholder="opsiyonel" placeholderTextColor={Colors.textMuted} />

              <Text style={styles.fieldLabel}>Notlar</Text>
              <TextInput style={[styles.input, styles.textarea]} value={form.notes}
                onChangeText={v => setForm(f => ({ ...f, notes: v }))}
                placeholder="Açıklama..." multiline placeholderTextColor={Colors.textMuted} />

              {/* Üretim partisinden ürünler */}
              <Text style={[styles.fieldLabel, { marginTop: Spacing.sm }]}>Fırına Girecek Ürünler</Text>
              {(() => {
                const filteredItems = activeItems.filter(item =>
                  FIRING_STAGE_FILTER[form.firing_type].includes(item.current_stage)
                );
                if (filteredItems.length === 0) {
                  return <Text style={styles.emptyText}>Bu pişirim tipi için bekleyen ürün yok</Text>;
                }
                return filteredItems.map(item => {
                  const isSelected = selectedItems.has(item.id);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.itemSelect, isSelected && styles.itemSelectActive]}
                      onPress={() => toggleItem(item)}
                    >
                      <View style={styles.itemSelectLeft}>
                        <Ionicons
                          name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                          size={20}
                          color={isSelected ? Colors.primary : Colors.textMuted}
                        />
                        <View>
                          <Text style={styles.itemSelectName}>{item.product_name}</Text>
                          {(item.liquid_clay_batch_name || item.color_recipe_name) && (
                            <Text style={styles.itemSelectColor}>
                              {item.liquid_clay_batch_name ?? item.color_recipe_name}
                            </Text>
                          )}
                        </View>
                      </View>
                      <Text style={styles.itemSelectQty}>{item.quantity} adet</Text>
                    </TouchableOpacity>
                  );
                });
              })()}

              {/* Diğer — katalogdan ürün ekle */}
              <View style={styles.divider} />

              {/* Eklenmiş özel ürünler */}
              {customItems.map((ci, i) => (
                <View key={i} style={styles.customItemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.customItemName} numberOfLines={1}>{ci.product_name}</Text>
                    {ci.color_recipe_name && (
                      <Text style={styles.customItemColor}>{ci.color_recipe_name}</Text>
                    )}
                  </View>
                  <View style={styles.stepper}>
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() => setCustomItems(prev => prev.map((p, idx) =>
                        idx === i ? { ...p, quantity: Math.max(1, p.quantity - 1) } : p
                      ))}
                    >
                      <Ionicons name="remove" size={16} color={Colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.stepperQty}>{ci.quantity}</Text>
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() => setCustomItems(prev => prev.map((p, idx) =>
                        idx === i ? { ...p, quantity: p.quantity + 1 } : p
                      ))}
                    >
                      <Ionicons name="add" size={16} color={Colors.text} />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={() => removeCustomItem(i)} style={{ padding: 4 }}>
                    <Ionicons name="close-circle" size={18} color={Colors.error} />
                  </TouchableOpacity>
                </View>
              ))}

              {/* Ürün seçici — Diğer ekle */}
              {showProductPicker ? (
                <Card variant="outlined" style={styles.pickerCard}>
                  <Text style={styles.pickerLabel}>Ürün Seç</Text>
                  <TouchableOpacity style={[styles.dropdownBtn, { marginBottom: Spacing.sm }]} onPress={showProductPickerAlert}>
                    <Ionicons name="cube-outline" size={18} color={pendingProduct ? Colors.text : Colors.textMuted} />
                    <Text style={[styles.dropdownText, pendingProduct && { color: Colors.text }]} numberOfLines={1}>
                      {pendingProduct
                        ? `${pendingProduct.name}  ·  ${pendingProduct.collection} ${pendingProduct.size}`
                        : 'Ürün seçin...'}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>

                  {colorRecipes.length > 0 && (
                    <>
                      <Text style={styles.pickerLabel}>Renk Reçetesi (opsiyonel)</Text>
                      <TouchableOpacity style={[styles.dropdownBtn, { marginBottom: Spacing.sm }]} onPress={showColorPickerAlert}>
                        <Ionicons name="color-palette-outline" size={18}
                          color={pendingColorRecipe ? Colors.primary : Colors.textMuted} />
                        <Text style={[styles.dropdownText, pendingColorRecipe && { color: Colors.text }]}>
                          {pendingColorRecipe ? pendingColorRecipe.name : '— Renksiz / Belirsiz'}
                        </Text>
                        <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
                      </TouchableOpacity>
                    </>
                  )}

                  <Text style={styles.pickerLabel}>Adet</Text>
                  <View style={styles.pendingStepper}>
                    <TouchableOpacity
                      style={styles.stepperBtnLg}
                      onPress={() => setPendingQty(q => Math.max(1, q - 1))}
                    >
                      <Ionicons name="remove" size={20} color={Colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.pendingQtyText}>{pendingQty}</Text>
                    <TouchableOpacity
                      style={styles.stepperBtnLg}
                      onPress={() => setPendingQty(q => q + 1)}
                    >
                      <Ionicons name="add" size={20} color={Colors.text} />
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm }}>
                    <TouchableOpacity style={styles.pickerAddBtn} onPress={confirmAddCustomItem}>
                      <Text style={styles.pickerAddBtnText}>Ekle</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.pickerAddBtn, { backgroundColor: Colors.surfaceVariant }]}
                      onPress={() => { setShowProductPicker(false); setPendingProduct(null); setPendingColorRecipe(null); setPendingQty(1); }}
                    >
                      <Text style={[styles.pickerAddBtnText, { color: Colors.textSecondary }]}>Kapat</Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              ) : (
                <TouchableOpacity style={styles.addOtherBtn}
                  onPress={() => setShowProductPicker(true)}>
                  <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
                  <Text style={styles.addOtherText}>Diğer Ürün Ekle</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.saveBtn} onPress={handleCreate}>
                <Text style={styles.saveBtnText}>Pişirimi Planla</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Detail Modal */}
      <Modal visible={showDetail} animationType="slide" presentationStyle="pageSheet"
        onDismiss={() => { setShowDetail(false); setIsEditing(false); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{isEditing ? 'Pişirimi Düzenle' : 'Pişirim Detayı'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                {!isEditing && (
                  <TouchableOpacity onPress={enterEditMode} style={styles.editIconBtn}>
                    <Ionicons name="pencil" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => { setShowDetail(false); setIsEditing(false); }}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            {selected && !isEditing && (
              <>
                <ScrollView style={styles.modalBody}>
                  <Card variant="filled" style={styles.detailCard}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Tip</Text>
                      <Badge label={FIRING_LABELS[selected.firing_type]} color={FIRING_COLORS[selected.firing_type]} size="sm" />
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Durum</Text>
                      <Badge label={STATUS_LABELS[selected.status]} color={STATUS_COLORS[selected.status]} size="sm" />
                    </View>
                    {selected.kiln_name && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Fırın</Text>
                        <Text style={styles.detailValue}>{selected.kiln_name}</Text>
                      </View>
                    )}
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Tarih</Text>
                      <Text style={styles.detailValue}>{selected.date}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Sıcaklık</Text>
                      <Text style={styles.detailValue}>{selected.temperature}°C</Text>
                    </View>
                    {selected.program_name && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Program</Text>
                        <Text style={styles.detailValue}>{selected.program_name}</Text>
                      </View>
                    )}
                    {selected.duration_hours && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Süre</Text>
                        <Text style={styles.detailValue}>{selected.duration_hours} saat</Text>
                      </View>
                    )}
                    {selected.notes && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Not</Text>
                        <Text style={styles.detailValue}>{selected.notes}</Text>
                      </View>
                    )}
                    {/* Elektrik maliyeti özeti */}
                    {firingCost && firingCost.total_electricity_cost > 0 && (
                      <>
                        <View style={styles.detailDivider} />
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Elektrik Maliyeti</Text>
                          <Text style={[styles.detailValue, styles.costHighlight]}>
                            ₺{firingCost.total_electricity_cost.toFixed(2)}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Birim Fiyat</Text>
                          <Text style={styles.detailValue}>
                            ₺{firingCost.electricity_price_per_kwh.toFixed(2)}/kWh
                          </Text>
                        </View>
                      </>
                    )}
                    {firingCost?.missing_electricity_price && (
                      <View style={styles.costWarningRow}>
                        <Ionicons name="flash-outline" size={13} color={Colors.textMuted} />
                        <Text style={styles.costWarningText}>Elektrik birim fiyatı girilmemiş</Text>
                      </View>
                    )}
                    {firingCost?.missing_kiln_or_duration && (
                      <View style={styles.costWarningRow}>
                        <Ionicons name="information-circle-outline" size={13} color={Colors.textMuted} />
                        <Text style={styles.costWarningText}>Fırın veya süre bilgisi eksik</Text>
                      </View>
                    )}
                  </Card>

                  {(selected.items?.length ?? 0) > 0 && (
                    <>
                      <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>Üretim Ürünleri</Text>
                      {selected.items?.map(item => {
                        const costEntry = firingCost?.item_costs[item.production_item_id];
                        return (
                          <Card key={item.id} variant="outlined" style={styles.firingItemCard}>
                            <View style={styles.firingItemRow}>
                              <Text style={styles.firingItemName}>{item.product_name}</Text>
                              <Text style={styles.firingItemQty}>{item.quantity} adet</Text>
                            </View>
                            {(item.liquid_clay_batch_name || item.color_recipe_name) && (
                              <Text style={styles.firingItemColor}>
                                {item.liquid_clay_batch_name ?? item.color_recipe_name}
                              </Text>
                            )}
                            {costEntry && (
                              <View style={styles.itemCostRow}>
                                <Text style={styles.itemCostText}>
                                  ₺{costEntry.per_unit_cost.toFixed(2)}/adet elektrik payı
                                </Text>
                                <Text style={styles.itemCostTotal}>
                                  ₺{costEntry.total_cost.toFixed(2)}
                                </Text>
                              </View>
                            )}
                          </Card>
                        );
                      })}
                    </>
                  )}

                  {(selected.custom_items?.length ?? 0) > 0 && (
                    <>
                      <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>Diğer Ürünler</Text>
                      {selected.custom_items?.map((ci, i) => (
                        <Card key={i} variant="outlined" style={styles.firingItemCard}>
                          <View style={styles.firingItemRow}>
                            <Text style={styles.firingItemName}>{ci.product_name}</Text>
                            <Text style={styles.firingItemQty}>{ci.quantity} adet</Text>
                          </View>
                          {ci.color_recipe_name && (
                            <Text style={styles.firingItemColor}>{ci.color_recipe_name}</Text>
                          )}
                        </Card>
                      ))}
                    </>
                  )}

                  {(selected.items?.length ?? 0) === 0 && (selected.custom_items?.length ?? 0) === 0 && (
                    <Text style={styles.emptyText}>Ürün eklenmemiş</Text>
                  )}
                </ScrollView>
                <View style={styles.modalFooter}>
                  {selected.status !== 'done' && (
                    <TouchableOpacity style={styles.statusBtn}
                      onPress={() => handleStatusChange(selected)}>
                      <Ionicons name="arrow-forward-circle" size={18} color={Colors.primary} />
                      <Text style={styles.statusBtnText}>Durumu Güncelle</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => {
                    Alert.alert('Sil', 'Bu pişirim kaydı silinsin mi?', [
                      { text: 'İptal', style: 'cancel' },
                      {
                        text: 'Sil', style: 'destructive',
                        onPress: async () => { await deleteKilnFiring(selected.id); setShowDetail(false); load(); },
                      },
                    ]);
                  }}>
                    <Ionicons name="trash-outline" size={18} color={Colors.error} />
                  </TouchableOpacity>
                </View>
              </>
            )}

            {selected && isEditing && (
              <>
                <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                  {/* Fırın seçimi */}
                  <Text style={styles.fieldLabel}>Fırın Seçimi</Text>
                  <TouchableOpacity style={styles.dropdownBtn} onPress={showKilnPicker}>
                    <Ionicons name="flame-outline" size={18}
                      color={kilns.find(k => k.id === form.kiln_id) ? Colors.warning : Colors.textMuted} />
                    <Text style={[styles.dropdownText, kilns.find(k => k.id === form.kiln_id) && { color: Colors.text }]}>
                      {kilns.find(k => k.id === form.kiln_id)
                        ? `${kilns.find(k => k.id === form.kiln_id)!.name} — ${kilns.find(k => k.id === form.kiln_id)!.power_kw} kWh`
                        : 'Fırın seçin...'}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>

                  <Text style={styles.fieldLabel}>Pişirim Tipi</Text>
                  <View style={styles.typeRow}>
                    {(['bisque', 'glaze', 'decal'] as FiringType[]).map(t => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.typeBtn, form.firing_type === t && { backgroundColor: FIRING_COLORS[t] + '30', borderColor: FIRING_COLORS[t] }]}
                        onPress={() => setFiringType(t)}
                      >
                        <Ionicons name="flame" size={16} color={form.firing_type === t ? FIRING_COLORS[t] : Colors.textMuted} />
                        <Text style={[styles.typeBtnText, form.firing_type === t && { color: FIRING_COLORS[t], fontWeight: '600' }]}>
                          {FIRING_LABELS[t]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.fieldLabel}>Tarih</Text>
                  <TextInput style={styles.input} value={form.date}
                    onChangeText={v => setForm(f => ({ ...f, date: v }))}
                    placeholder="YYYY-MM-DD" placeholderTextColor={Colors.textMuted} />

                  <Text style={styles.fieldLabel}>Program Adı (opsiyonel)</Text>
                  <TextInput style={styles.input} value={form.program_name}
                    onChangeText={v => setForm(f => ({ ...f, program_name: v }))}
                    placeholder="örn. P1, Standart Bisküvi..." placeholderTextColor={Colors.textMuted} />

                  <Text style={styles.fieldLabel}>Sıcaklık (°C)</Text>
                  <TextInput style={styles.input} value={form.temperature}
                    onChangeText={v => setForm(f => ({ ...f, temperature: v }))}
                    keyboardType="number-pad" placeholderTextColor={Colors.textMuted} />

                  <Text style={styles.fieldLabel}>Süre (saat)</Text>
                  <TextInput style={styles.input} value={form.duration_hours}
                    onChangeText={v => setForm(f => ({ ...f, duration_hours: v }))}
                    keyboardType="decimal-pad" placeholder="opsiyonel" placeholderTextColor={Colors.textMuted} />

                  <Text style={styles.fieldLabel}>Notlar</Text>
                  <TextInput style={[styles.input, styles.textarea]} value={form.notes}
                    onChangeText={v => setForm(f => ({ ...f, notes: v }))}
                    placeholder="Açıklama..." multiline placeholderTextColor={Colors.textMuted} />

                  <Text style={[styles.fieldLabel, { marginTop: Spacing.sm }]}>Fırına Girecek Ürünler</Text>
                  {(() => {
                    const filteredItems = activeItems.filter(item =>
                      FIRING_STAGE_FILTER[form.firing_type].includes(item.current_stage)
                    );
                    if (filteredItems.length === 0) {
                      return <Text style={styles.emptyText}>Bu pişirim tipi için bekleyen ürün yok</Text>;
                    }
                    return filteredItems.map(item => {
                      const isSelected = selectedItems.has(item.id);
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[styles.itemSelect, isSelected && styles.itemSelectActive]}
                          onPress={() => toggleItem(item)}
                        >
                          <View style={styles.itemSelectLeft}>
                            <Ionicons
                              name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                              size={20}
                              color={isSelected ? Colors.primary : Colors.textMuted}
                            />
                            <View>
                              <Text style={styles.itemSelectName}>{item.product_name}</Text>
                              {(item.liquid_clay_batch_name || item.color_recipe_name) && (
                                <Text style={styles.itemSelectColor}>
                                  {item.liquid_clay_batch_name ?? item.color_recipe_name}
                                </Text>
                              )}
                            </View>
                          </View>
                          <Text style={styles.itemSelectQty}>{item.quantity} adet</Text>
                        </TouchableOpacity>
                      );
                    });
                  })()}

                  <View style={styles.divider} />

                  {customItems.map((ci, i) => (
                    <View key={i} style={styles.customItemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.customItemName} numberOfLines={1}>{ci.product_name}</Text>
                        {ci.color_recipe_name && (
                          <Text style={styles.customItemColor}>{ci.color_recipe_name}</Text>
                        )}
                      </View>
                      <View style={styles.stepper}>
                        <TouchableOpacity style={styles.stepperBtn}
                          onPress={() => setCustomItems(prev => prev.map((p, idx) =>
                            idx === i ? { ...p, quantity: Math.max(1, p.quantity - 1) } : p))}>
                          <Ionicons name="remove" size={16} color={Colors.text} />
                        </TouchableOpacity>
                        <Text style={styles.stepperQty}>{ci.quantity}</Text>
                        <TouchableOpacity style={styles.stepperBtn}
                          onPress={() => setCustomItems(prev => prev.map((p, idx) =>
                            idx === i ? { ...p, quantity: p.quantity + 1 } : p))}>
                          <Ionicons name="add" size={16} color={Colors.text} />
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity onPress={() => removeCustomItem(i)} style={{ padding: 4 }}>
                        <Ionicons name="close-circle" size={18} color={Colors.error} />
                      </TouchableOpacity>
                    </View>
                  ))}

                  {showProductPicker ? (
                    <Card variant="outlined" style={styles.pickerCard}>
                      <Text style={styles.pickerLabel}>Ürün Seç</Text>
                      <TouchableOpacity style={[styles.dropdownBtn, { marginBottom: Spacing.sm }]} onPress={showProductPickerAlert}>
                        <Ionicons name="cube-outline" size={18} color={pendingProduct ? Colors.text : Colors.textMuted} />
                        <Text style={[styles.dropdownText, pendingProduct && { color: Colors.text }]} numberOfLines={1}>
                          {pendingProduct
                            ? `${pendingProduct.name}  ·  ${pendingProduct.collection} ${pendingProduct.size}`
                            : 'Ürün seçin...'}
                        </Text>
                        <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
                      </TouchableOpacity>

                      {colorRecipes.length > 0 && (
                        <>
                          <Text style={styles.pickerLabel}>Renk Reçetesi (opsiyonel)</Text>
                          <TouchableOpacity style={[styles.dropdownBtn, { marginBottom: Spacing.sm }]} onPress={showColorPickerAlert}>
                            <Ionicons name="color-palette-outline" size={18}
                              color={pendingColorRecipe ? Colors.primary : Colors.textMuted} />
                            <Text style={[styles.dropdownText, pendingColorRecipe && { color: Colors.text }]}>
                              {pendingColorRecipe ? pendingColorRecipe.name : '— Renksiz / Belirsiz'}
                            </Text>
                            <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
                          </TouchableOpacity>
                        </>
                      )}

                      <Text style={styles.pickerLabel}>Adet</Text>
                      <View style={styles.pendingStepper}>
                        <TouchableOpacity style={styles.stepperBtnLg} onPress={() => setPendingQty(q => Math.max(1, q - 1))}>
                          <Ionicons name="remove" size={20} color={Colors.text} />
                        </TouchableOpacity>
                        <Text style={styles.pendingQtyText}>{pendingQty}</Text>
                        <TouchableOpacity style={styles.stepperBtnLg} onPress={() => setPendingQty(q => q + 1)}>
                          <Ionicons name="add" size={20} color={Colors.text} />
                        </TouchableOpacity>
                      </View>
                      <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm }}>
                        <TouchableOpacity style={styles.pickerAddBtn} onPress={confirmAddCustomItem}>
                          <Text style={styles.pickerAddBtnText}>Ekle</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.pickerAddBtn, { backgroundColor: Colors.surfaceVariant }]}
                          onPress={() => { setShowProductPicker(false); setPendingProduct(null); setPendingColorRecipe(null); setPendingQty(1); }}
                        >
                          <Text style={[styles.pickerAddBtnText, { color: Colors.textSecondary }]}>Kapat</Text>
                        </TouchableOpacity>
                      </View>
                    </Card>
                  ) : (
                    <TouchableOpacity style={styles.addOtherBtn} onPress={() => setShowProductPicker(true)}>
                      <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
                      <Text style={styles.addOtherText}>Diğer Ürün Ekle</Text>
                    </TouchableOpacity>
                  )}
                </ScrollView>
                <View style={styles.modalFooter}>
                  <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: Colors.surfaceVariant, flex: 0, paddingHorizontal: Spacing.lg }]}
                    onPress={() => setIsEditing(false)}
                  >
                    <Text style={[styles.saveBtnText, { color: Colors.textSecondary }]}>İptal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveBtn} onPress={handleUpdate}>
                    <Text style={styles.saveBtnText}>Kaydet</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </SafeAreaView>
        </KeyboardAvoidingView>
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
  list: { padding: Spacing.md, paddingBottom: Spacing.xl },

  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing.sm, paddingHorizontal: 2,
    marginTop: Spacing.sm,
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { ...Typography.label, color: Colors.textSecondary, fontWeight: '700' },
  sectionBadge: {
    borderRadius: BorderRadius.full, paddingHorizontal: 7, paddingVertical: 2,
  },
  sectionBadgeText: { ...Typography.caption, fontWeight: '700', fontSize: 11 },

  card: { gap: Spacing.xs, marginBottom: Spacing.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardLeft: { gap: 2 },
  cardRight: { gap: 4, alignItems: 'flex-end' },
  tempRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tempText: { ...Typography.h3, color: Colors.text },
  cardDate: { ...Typography.caption, color: Colors.textMuted },
  programName: { ...Typography.bodySmall, color: Colors.textSecondary },
  duration: { ...Typography.caption, color: Colors.textMuted },

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
  textarea: { height: 80, textAlignVertical: 'top' },

  // Fırın dropdown
  dropdownBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, paddingVertical: 12,
    marginBottom: Spacing.md,
  },
  dropdownText: { ...Typography.body, color: Colors.textMuted, flex: 1 },

  typeRow: { flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.md },
  typeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 10, borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  typeBtnText: { ...Typography.bodySmall, color: Colors.textSecondary },

  itemSelect: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.md, borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
    marginBottom: Spacing.xs,
  },
  itemSelectActive: { borderColor: Colors.primary, backgroundColor: Colors.accentLight },
  itemSelectLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  itemSelectName: { ...Typography.bodySmall, fontWeight: '600', color: Colors.text },
  itemSelectColor: { ...Typography.caption, color: Colors.textSecondary },
  itemSelectQty: { ...Typography.caption, color: Colors.textMuted },

  divider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.md },

  // Özel ürünler (Diğer)
  customItemRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.sm, padding: Spacing.sm, marginBottom: Spacing.xs,
  },
  customItemName: { ...Typography.bodySmall, fontWeight: '600', color: Colors.text },
  customItemColor: { ...Typography.caption, color: Colors.textSecondary, marginTop: 1 },
  stepper: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.surfaceVariant, borderRadius: BorderRadius.sm, padding: 2,
  },
  stepperBtn: {
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
    borderRadius: 6, backgroundColor: Colors.surface,
  },
  stepperQty: { ...Typography.bodySmall, fontWeight: '600', color: Colors.text, minWidth: 24, textAlign: 'center' },

  addOtherBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  addOtherText: { ...Typography.bodySmall, color: Colors.primary, fontWeight: '600' },

  pickerCard: { marginBottom: Spacing.sm, padding: Spacing.sm },
  pickerLabel: { ...Typography.label, color: Colors.textSecondary, marginBottom: 4 },
  pendingStepper: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surfaceVariant, borderRadius: BorderRadius.sm,
    padding: 4, alignSelf: 'flex-start',
  },
  stepperBtnLg: {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
    borderRadius: BorderRadius.sm, backgroundColor: Colors.surface,
  },
  pendingQtyText: { ...Typography.h3, color: Colors.text, minWidth: 32, textAlign: 'center' },
  pickerAddBtn: {
    flex: 1, backgroundColor: Colors.primary, borderRadius: BorderRadius.sm,
    paddingVertical: 10, alignItems: 'center',
  },
  pickerAddBtnText: { ...Typography.bodySmall, fontWeight: '600', color: Colors.surface },

  saveBtn: {
    flex: 1, backgroundColor: Colors.primary, borderRadius: BorderRadius.sm,
    paddingVertical: 14, alignItems: 'center',
  },
  saveBtnText: { ...Typography.body, fontWeight: '600', color: Colors.surface },
  statusBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: Colors.primary, borderRadius: BorderRadius.sm, paddingVertical: 14,
  },
  statusBtnText: { ...Typography.body, color: Colors.primary, fontWeight: '600' },
  deleteBtn: {
    width: 50, borderWidth: 1, borderColor: Colors.error, borderRadius: BorderRadius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  editIconBtn: {
    width: 34, height: 34, borderRadius: BorderRadius.sm,
    borderWidth: 1, borderColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },

  detailCard: { gap: Spacing.sm, marginBottom: Spacing.md },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { ...Typography.bodySmall, color: Colors.textSecondary },
  detailValue: { ...Typography.bodySmall, color: Colors.text, fontWeight: '500' },

  firingItemCard: { marginBottom: Spacing.xs },
  firingItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  firingItemName: { ...Typography.bodySmall, fontWeight: '600', color: Colors.text },
  firingItemQty: { ...Typography.caption, color: Colors.textSecondary },
  firingItemColor: { ...Typography.caption, color: Colors.textMuted },
  itemCostRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 4, paddingTop: 4,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  itemCostText: { ...Typography.caption, color: Colors.textMuted },
  itemCostTotal: { ...Typography.caption, fontWeight: '600', color: Colors.textSecondary },

  detailDivider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.sm },
  costHighlight: { fontWeight: '700', color: Colors.text },
  costWarningRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: Spacing.xs, paddingTop: Spacing.xs,
  },
  costWarningText: { ...Typography.caption, color: Colors.textMuted, flex: 1 },

  emptyText: { ...Typography.body, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.md },
});
