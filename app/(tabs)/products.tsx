import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, TextInput, Modal, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Colors, Spacing, Typography, BorderRadius } from '../../src/constants/theme';
import { Card } from '../../src/components/Card';
import { Badge } from '../../src/components/Badge';
import { EmptyState } from '../../src/components/EmptyState';
import {
  getProducts, addProduct, deleteProduct, updateProduct, getProductRecipe, calculateProductCost,
} from '../../src/services/products';
import { getMaterials } from '../../src/services/materials';
import { getProfile } from '../../src/services/settings';
import { getProductWeights, saveProductWeights, deleteProductWeight } from '../../src/services/productWeights';
import {
  Product, ProductSize, ProductRecipeItem, Material, FiringStage,
  ProductWeight, ProductWeightStage, WEIGHT_STAGES, WEIGHT_STAGE_LABELS,
} from '../../src/types';

const SIZES: ProductSize[] = ['Standart', 'Mini', 'Midi', 'Maxi'];

const COLLECTION_PALETTE = [
  '#3E6B8B','#4E8B6B','#8B4E6B','#6B6B3E','#6B6B6B',
  '#7C3AED','#B45309','#047857','#DC2626','#0369A1',
];
function getCollectionColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % COLLECTION_PALETTE.length;
  return COLLECTION_PALETTE[hash];
}

const STAGE_LABELS: Record<FiringStage, string> = {
  casting: 'Döküm/Çamur',
  glaze: 'Sırlama',
  decal: 'Dekal',
};

export default function ProductsScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<string[]>(['Rigel', 'Origo', 'Onnimug', 'Vega', 'Diğer']);
  const [filterCollection, setFilterCollection] = useState<string | 'all'>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [recipe, setRecipe] = useState<ProductRecipeItem[]>([]);
  const [costDetail, setCostDetail] = useState<{ recipe_cost: number; clay_cost: number; total: number; casting_weight_gr?: number; avg_cost_per_kg?: number }>({ recipe_cost: 0, clay_cost: 0, total: 0 });
  const [materials, setMaterials] = useState<Material[]>([]);

  // Form
  const [form, setForm] = useState({
    name: '',
    collection: 'Rigel' as string,
    size: 'Standart' as ProductSize,
    selling_price: '',
    firing_count: 3 as 2 | 3,
    description: '',
  });
  const [recipeItems, setRecipeItems] = useState<Omit<ProductRecipeItem, 'id' | 'product_id' | 'material_name' | 'material_unit'>[]>([]);
  const [showRecipeAdd, setShowRecipeAdd] = useState(false);
  const [recipeStage, setRecipeStage] = useState<FiringStage>('casting');
  const [recipeMaterial, setRecipeMaterial] = useState<Material | null>(null);
  const [recipeQty, setRecipeQty] = useState('');

  // Weights — detail modal içinde mod olarak açılır (iOS'ta iç içe modal çalışmaz)
  const [weightMode, setWeightMode] = useState(false);
  const [weightDraft, setWeightDraft] = useState<Partial<Record<ProductWeightStage, string>>>({});

  // Edit
  const [showEdit, setShowEdit] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState({ name: '', collection: 'Rigel' as string, size: 'Standart' as ProductSize, selling_price: '', firing_count: 3 as 2 | 3, description: '' });
  const swipeableRefs = useRef<Map<number, Swipeable>>(new Map());

  const load = useCallback(async () => {
    const [prods, mats, profile] = await Promise.all([getProducts(), getMaterials(), getProfile()]);
    setProducts(prods);
    setMaterials(mats);
    setCollections(profile.active_collections);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function openEdit(product: Product) {
    swipeableRefs.current.get(product.id)?.close();
    setEditProduct(product);
    setEditForm({
      name: product.name,
      collection: product.collection,
      size: product.size,
      selling_price: product.selling_price.toString(),
      firing_count: product.firing_count,
      description: product.description ?? '',
    });
    setShowEdit(true);
  }

  async function handleSaveEdit() {
    if (!editProduct || !editForm.name.trim()) return Alert.alert('Hata', 'Ürün adı gerekli');
    try {
      await updateProduct(editProduct.id, {
        name: editForm.name.trim(),
        collection: editForm.collection,
        size: editForm.size,
        selling_price: parseFloat(editForm.selling_price) || 0,
        firing_count: editForm.firing_count,
        description: editForm.description || undefined,
      });
      setShowEdit(false);
      load();
    } catch {
      Alert.alert('Hata', 'Ürün güncellenemedi');
    }
  }

  async function openDetail(product: Product) {
    setSelected(product);
    const [r, c] = await Promise.all([getProductRecipe(product.id), calculateProductCost(product.id)]);
    setRecipe(r);
    setCostDetail(c);
    setShowDetail(true);
  }

  async function openWeights(product: Product) {
    const rows = await getProductWeights(product.id);
    const draft: Partial<Record<ProductWeightStage, string>> = {};
    rows.forEach(w => { draft[w.stage] = String(w.weight_gr); });
    setWeightDraft(draft);
    setWeightMode(true);
  }

  async function handleSaveWeights() {
    if (!selected) return;
    const weights: Partial<Record<ProductWeightStage, number>> = {};
    for (const stage of WEIGHT_STAGES) {
      const val = parseFloat(weightDraft[stage] ?? '');
      if (!isNaN(val) && val > 0) weights[stage] = val;
    }
    const existing = await getProductWeights(selected.id);
    for (const row of existing) {
      if (!(row.stage in weights)) {
        await deleteProductWeight(selected.id, row.stage as ProductWeightStage);
      }
    }
    await saveProductWeights(selected.id, weights);
    setWeightMode(false);
  }

  function calcWeights() {
    const v = (s: ProductWeightStage) => parseFloat(weightDraft[s] ?? '');
    const casting = v('casting'), drying = v('drying');
    const preBisque = v('pre_bisque'), postBisque = v('post_bisque');
    const preGlaze = v('pre_glaze'), postGlaze = v('post_glaze');
    const postGlazeFiring = v('post_glaze_firing');
    return {
      kurumaKaybi:       (!isNaN(casting) && !isNaN(drying))           ? casting - drying                            : null,
      biskuviBuzulme:    (!isNaN(drying) && !isNaN(postBisque) && drying > 0)
                           ? ((drying - postBisque) / drying * 100)    : null,
      sirTutma:          (!isNaN(preGlaze) && !isNaN(postGlaze))       ? postGlaze - preGlaze                        : null,
      sirPisirımKaybi:   (!isNaN(postGlaze) && !isNaN(postGlazeFiring)) ? postGlaze - postGlazeFiring : null,
      toplamKuculme:     (!isNaN(casting) && !isNaN(postGlazeFiring) && casting > 0)
                           ? ((casting - postGlazeFiring) / casting * 100) : null,
    };
  }

  async function handleAdd() {
    if (!form.name.trim()) return Alert.alert('Hata', 'Ürün adı gerekli');
    try {
      await addProduct(
        {
          name: form.name.trim(),
          collection: form.collection,
          size: form.size,
          selling_price: parseFloat(form.selling_price) || 0,
          firing_count: form.firing_count,
          description: form.description || undefined,
        },
        recipeItems
      );
      setShowAdd(false);
      resetForm();
      load();
    } catch (e) {
      Alert.alert('Hata', 'Ürün eklenemedi');
    }
  }

  function resetForm() {
    setForm({ name: '', collection: collections[0] ?? 'Diğer', size: 'Standart', selling_price: '', firing_count: 3, description: '' });
    setRecipeItems([]);
    setShowRecipeAdd(false);
    setRecipeMaterial(null);
    setRecipeQty('');
  }

  function handleAddRecipeItem() {
    if (!recipeMaterial) return Alert.alert('Hata', 'Hammadde seçin');
    const qty = parseFloat(recipeQty);
    if (!qty) return Alert.alert('Hata', 'Miktar girin');
    setRecipeItems(prev => [...prev, { material_id: recipeMaterial.id, quantity: qty, stage: recipeStage }]);
    setRecipeMaterial(null);
    setRecipeQty('');
    setShowRecipeAdd(false);
  }

  function handleDelete(product: Product) {
    Alert.alert('Ürün Sil', `"${product.name}" silinsin mi?`, [
      { text: 'İptal', style: 'cancel', onPress: () => swipeableRefs.current.get(product.id)?.close() },
      {
        text: 'Sil', style: 'destructive',
        onPress: async () => { await deleteProduct(product.id); setShowDetail(false); load(); },
      },
    ]);
  }

  const filtered = filterCollection === 'all' ? products : products.filter(p => p.collection === filterCollection);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Ürünler</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Ionicons name="add" size={22} color={Colors.surface} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterContent}>
        {(['all', ...collections]).map(c => (
          <TouchableOpacity
            key={c}
            style={[styles.filterChip, filterCollection === c && styles.filterChipActive, filterCollection === c && c !== 'all' && { backgroundColor: getCollectionColor(c) }]}
            onPress={() => setFilterCollection(c)}
          >
            <Text style={[styles.filterText, filterCollection === c && styles.filterTextActive]}>
              {c === 'all' ? 'Tümü' : c}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id.toString()}
        renderItem={({ item }) => (
          <Swipeable
            ref={ref => { if (ref) swipeableRefs.current.set(item.id, ref); else swipeableRefs.current.delete(item.id); }}
            overshootLeft={false}
            overshootRight={false}
            renderLeftActions={() => (
              <TouchableOpacity style={styles.swipeDelete} onPress={() => {
                swipeableRefs.current.get(item.id)?.close();
                handleDelete(item);
              }}>
                <Ionicons name="trash" size={22} color={Colors.surface} />
                <Text style={styles.swipeDeleteText}>Sil</Text>
              </TouchableOpacity>
            )}
            renderRightActions={() => (
              <TouchableOpacity style={styles.swipeEdit} onPress={() => openEdit(item)}>
                <Ionicons name="pencil" size={22} color={Colors.surface} />
                <Text style={styles.swipeEditText}>Düzenle</Text>
              </TouchableOpacity>
            )}
          >
            <Card style={styles.productCard} onPress={() => openDetail(item)}>
              <View style={styles.productHeader}>
                <Text style={styles.productName}>{item.name}</Text>
                <Badge label={item.collection} color={getCollectionColor(item.collection)} size="sm" />
              </View>
              <View style={styles.productFooter}>
                <Text style={styles.productPrice}>₺{item.selling_price.toLocaleString('tr-TR')}</Text>
                <View style={styles.productMeta}>
                  <Text style={styles.productSize}>{item.size}</Text>
                  <Text style={styles.productFiring}>{item.firing_count} pişirim</Text>
                </View>
              </View>
            </Card>
          </Swipeable>
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState icon="diamond-outline" title="Ürün bulunamadı" subtitle="Yeni ürün eklemek için + butonuna dokunun" />
        }
      />

      {/* Add Product Modal */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet" onDismiss={() => { setShowAdd(false); resetForm(); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Yeni Ürün</Text>
              <TouchableOpacity onPress={() => { setShowAdd(false); resetForm(); }}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.fieldLabel}>Ad</Text>
              <TextInput style={styles.input} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} placeholder="Ürün adı" placeholderTextColor={Colors.textMuted} />

              <Text style={styles.fieldLabel}>Koleksiyon</Text>
              <View style={styles.optionRow}>
                {collections.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.optionChip, form.collection === c && { backgroundColor: getCollectionColor(c), borderColor: getCollectionColor(c) }]}
                    onPress={() => setForm(f => ({ ...f, collection: c }))}
                  >
                    <Text style={[styles.optionText, form.collection === c && { color: Colors.surface }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Boy</Text>
              <View style={styles.optionRow}>
                {SIZES.map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.optionChip, form.size === s && styles.optionChipActive]}
                    onPress={() => setForm(f => ({ ...f, size: s }))}
                  >
                    <Text style={[styles.optionText, form.size === s && styles.optionTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Satış Fiyatı (₺)</Text>
              <TextInput style={styles.input} value={form.selling_price} onChangeText={v => setForm(f => ({ ...f, selling_price: v }))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={Colors.textMuted} />

              <Text style={styles.fieldLabel}>Pişirim Sayısı</Text>
              <View style={styles.optionRow}>
                {([2, 3] as const).map(n => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.optionChip, form.firing_count === n && styles.optionChipActive]}
                    onPress={() => setForm(f => ({ ...f, firing_count: n }))}
                  >
                    <Text style={[styles.optionText, form.firing_count === n && styles.optionTextActive]}>{n} pişirim</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Açıklama</Text>
              <TextInput style={[styles.input, styles.textarea]} value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} placeholder="Opsiyonel..." multiline placeholderTextColor={Colors.textMuted} />

              {/* Recipe */}
              <View style={styles.recipeHeader}>
                <Text style={styles.fieldLabel}>Hammadde Reçetesi</Text>
                <TouchableOpacity onPress={() => setShowRecipeAdd(prev => !prev)} style={styles.addRecipeBtn}>
                  <Ionicons name={showRecipeAdd ? 'chevron-up' : 'add'} size={16} color={Colors.primary} />
                  <Text style={styles.addRecipeText}>{showRecipeAdd ? 'Kapat' : 'Ekle'}</Text>
                </TouchableOpacity>
              </View>

              {showRecipeAdd && (
                <Card variant="outlined" style={styles.inlineForm}>
                  <Text style={styles.inlineLabel}>Aşama</Text>
                  <View style={[styles.optionRow, { marginBottom: Spacing.sm }]}>
                    {(['casting', 'glaze', 'decal'] as FiringStage[]).map(s => (
                      <TouchableOpacity
                        key={s}
                        style={[styles.optionChip, recipeStage === s && styles.optionChipActive]}
                        onPress={() => setRecipeStage(s)}
                      >
                        <Text style={[styles.optionText, recipeStage === s && styles.optionTextActive]}>{STAGE_LABELS[s]}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.inlineLabel}>Hammadde</Text>
                  <ScrollView style={styles.selectList} nestedScrollEnabled>
                    {materials.map(m => (
                      <TouchableOpacity
                        key={m.id}
                        style={[styles.selectItem, recipeMaterial?.id === m.id && styles.selectItemActive]}
                        onPress={() => setRecipeMaterial(m)}
                      >
                        <Text style={[styles.selectText, recipeMaterial?.id === m.id && styles.selectTextActive]}>
                          {m.name} <Text style={{ color: Colors.textSecondary }}>({m.unit})</Text>
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text style={[styles.inlineLabel, { marginTop: Spacing.sm }]}>
                    Miktar ({recipeMaterial?.unit || 'birim'})
                  </Text>
                  <View style={styles.inlineRow}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginBottom: 0 }]}
                      value={recipeQty}
                      onChangeText={setRecipeQty}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={Colors.textMuted}
                    />
                    <TouchableOpacity style={styles.inlineAddBtn} onPress={handleAddRecipeItem}>
                      <Text style={styles.inlineAddBtnText}>Ekle</Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              )}

              {recipeItems.map((item, i) => {
                const mat = materials.find(m => m.id === item.material_id);
                return (
                  <Card key={i} variant="outlined" style={styles.recipeItem}>
                    <View style={styles.recipeItemRow}>
                      <View>
                        <Text style={styles.recipeItemName}>{mat?.name}</Text>
                        <Text style={styles.recipeItemStage}>{STAGE_LABELS[item.stage]}</Text>
                      </View>
                      <View style={styles.recipeItemRight}>
                        <Text style={styles.recipeItemQty}>{item.quantity} {mat?.unit}</Text>
                        <TouchableOpacity onPress={() => setRecipeItems(prev => prev.filter((_, idx) => idx !== i))}>
                          <Ionicons name="close-circle" size={18} color={Colors.error} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Card>
                );
              })}
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAdd}>
                <Text style={styles.saveBtnText}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Modal */}
      <Modal visible={showEdit} animationType="slide" presentationStyle="pageSheet" onDismiss={() => setShowEdit(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ürünü Düzenle</Text>
              <TouchableOpacity onPress={() => setShowEdit(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.fieldLabel}>Ad</Text>
              <TextInput style={styles.input} value={editForm.name} onChangeText={v => setEditForm(f => ({ ...f, name: v }))} placeholderTextColor={Colors.textMuted} />

              <Text style={styles.fieldLabel}>Koleksiyon</Text>
              <View style={styles.optionRow}>
                {collections.map(c => (
                  <TouchableOpacity key={c} style={[styles.optionChip, editForm.collection === c && { backgroundColor: getCollectionColor(c), borderColor: getCollectionColor(c) }]} onPress={() => setEditForm(f => ({ ...f, collection: c }))}>
                    <Text style={[styles.optionText, editForm.collection === c && { color: Colors.surface }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Boy</Text>
              <View style={styles.optionRow}>
                {SIZES.map(s => (
                  <TouchableOpacity key={s} style={[styles.optionChip, editForm.size === s && styles.optionChipActive]} onPress={() => setEditForm(f => ({ ...f, size: s }))}>
                    <Text style={[styles.optionText, editForm.size === s && styles.optionTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Satış Fiyatı (₺)</Text>
              <TextInput style={styles.input} value={editForm.selling_price} onChangeText={v => setEditForm(f => ({ ...f, selling_price: v }))} keyboardType="decimal-pad" placeholderTextColor={Colors.textMuted} />

              <Text style={styles.fieldLabel}>Pişirim Sayısı</Text>
              <View style={styles.optionRow}>
                {([2, 3] as const).map(n => (
                  <TouchableOpacity key={n} style={[styles.optionChip, editForm.firing_count === n && styles.optionChipActive]} onPress={() => setEditForm(f => ({ ...f, firing_count: n }))}>
                    <Text style={[styles.optionText, editForm.firing_count === n && styles.optionTextActive]}>{n} pişirim</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Açıklama</Text>
              <TextInput style={[styles.input, styles.textarea]} value={editForm.description} onChangeText={v => setEditForm(f => ({ ...f, description: v }))} placeholder="Opsiyonel..." multiline placeholderTextColor={Colors.textMuted} />
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveEdit}>
                <Text style={styles.saveBtnText}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Detail Modal */}
      <Modal visible={showDetail} animationType="slide" presentationStyle="pageSheet"
        onDismiss={() => { setShowDetail(false); setWeightMode(false); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            {weightMode ? (
              <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                onPress={() => setWeightMode(false)}>
                <Ionicons name="chevron-back" size={20} color={Colors.primary} />
                <Text style={[styles.modalTitle, { color: Colors.primary, fontSize: 16 }]}>Geri</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.modalTitle}>{selected?.name}</Text>
            )}
            <TouchableOpacity onPress={() => { setShowDetail(false); setWeightMode(false); }}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {/* ── Ağırlık Profili modu ── */}
          {selected && weightMode && (
            <>
              <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                <Text style={[styles.modalTitle, { marginBottom: Spacing.sm }]}>Ağırlık Profili</Text>
                <Text style={[styles.detailLabel, { marginBottom: Spacing.md }]}>{selected.name}</Text>
                {WEIGHT_STAGES.map((stage, i) => (
                  <View key={stage} style={styles.weightRow}>
                    <View style={styles.weightStageInfo}>
                      <Text style={styles.weightStageNum}>{i + 1}</Text>
                      <Text style={styles.weightStageLabel}>{WEIGHT_STAGE_LABELS[stage]}</Text>
                    </View>
                    <View style={styles.weightInputWrap}>
                      <TextInput
                        style={styles.weightInput}
                        value={weightDraft[stage] ?? ''}
                        onChangeText={v => setWeightDraft(prev => ({ ...prev, [stage]: v }))}
                        keyboardType="decimal-pad"
                        placeholder="—"
                        placeholderTextColor={Colors.textMuted}
                      />
                      <Text style={styles.weightUnit}>gr</Text>
                    </View>
                  </View>
                ))}
                {(() => {
                  const c = calcWeights();
                  if (!Object.values(c).some(v => v !== null)) return null;
                  return (
                    <Card variant="filled" style={styles.calcCard}>
                      <Text style={styles.calcTitle}>Hesaplamalar</Text>
                      {c.kurumaKaybi !== null && (
                        <View style={styles.calcRow}>
                          <Text style={styles.calcLabel}>Kuruma Kaybı (su)</Text>
                          <Text style={styles.calcValue}>{c.kurumaKaybi.toFixed(1)} gr</Text>
                        </View>
                      )}
                      {c.biskuviBuzulme !== null && (
                        <View style={styles.calcRow}>
                          <Text style={styles.calcLabel}>Bisküvi Büzülmesi</Text>
                          <Text style={styles.calcValue}>%{c.biskuviBuzulme.toFixed(1)}</Text>
                        </View>
                      )}
                      {c.sirTutma !== null && (
                        <View style={[styles.calcRow, styles.calcRowHighlight]}>
                          <Text style={[styles.calcLabel, { color: Colors.primary }]}>Sır Tutma</Text>
                          <Text style={[styles.calcValue, { color: Colors.primary, fontWeight: '700' }]}>
                            {c.sirTutma.toFixed(1)} gr
                          </Text>
                        </View>
                      )}
                      {c.sirPisirımKaybi !== null && (
                        <View style={styles.calcRow}>
                          <Text style={styles.calcLabel}>Sır Pişirim Kaybı</Text>
                          <Text style={styles.calcValue}>{c.sirPisirımKaybi.toFixed(1)} gr</Text>
                        </View>
                      )}
                      {c.toplamKuculme !== null && (
                        <View style={styles.calcRow}>
                          <Text style={styles.calcLabel}>Toplam Küçülme</Text>
                          <Text style={styles.calcValue}>%{c.toplamKuculme.toFixed(1)}</Text>
                        </View>
                      )}
                    </Card>
                  );
                })()}
              </ScrollView>
              <View style={styles.modalFooter}>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveWeights}>
                  <Text style={styles.saveBtnText}>Kaydet</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── Normal detay modu ── */}
          {selected && !weightMode && (
            <ScrollView style={styles.modalBody}>
              <Card variant="filled" style={styles.detailCard}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Koleksiyon</Text>
                  <Badge label={selected.collection} color={getCollectionColor(selected.collection)} size="sm" />
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Boy</Text>
                  <Text style={styles.detailValue}>{selected.size}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Satış Fiyatı</Text>
                  <Text style={styles.detailValue}>₺{selected.selling_price.toLocaleString('tr-TR')}</Text>
                </View>
                {costDetail.casting_weight_gr && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Döküm Ağırlığı</Text>
                    <Text style={styles.detailValue}>{costDetail.casting_weight_gr} gr</Text>
                  </View>
                )}
                {costDetail.clay_cost > 0 && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Sıvı Çamur{costDetail.avg_cost_per_kg ? ` (₺${costDetail.avg_cost_per_kg.toFixed(0)}/kg)` : ''}</Text>
                    <Text style={styles.detailValue}>₺{costDetail.clay_cost.toFixed(2)}</Text>
                  </View>
                )}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Toplam Hammadde Maliyeti</Text>
                  <Text style={[styles.detailValue, { color: Colors.primary }]}>₺{costDetail.total.toFixed(2)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Kar Marjı</Text>
                  <Text style={[styles.detailValue, { color: Colors.success }]}>
                    {selected.selling_price > 0 ? `%${(((selected.selling_price - costDetail.total) / selected.selling_price) * 100).toFixed(0)}` : '—'}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Pişirim Sayısı</Text>
                  <Text style={styles.detailValue}>{selected.firing_count}x</Text>
                </View>
              </Card>

            </ScrollView>
          )}

          {/* Detay modu footer — weight mode değilken göster */}
          {selected && !weightMode && (
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.weightsBtn} onPress={() => selected && openWeights(selected)}>
                <Ionicons name="scale-outline" size={18} color={Colors.primary} />
                <Text style={styles.weightsBtnText}>Ağırlık Profili</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => selected && handleDelete(selected)}>
                <Ionicons name="trash-outline" size={18} color={Colors.error} />
              </TouchableOpacity>
            </View>
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

  productCard: { gap: Spacing.sm },

  swipeDelete: {
    backgroundColor: Colors.error, justifyContent: 'center', alignItems: 'center',
    width: 80, marginVertical: 4, marginLeft: Spacing.md, borderRadius: BorderRadius.md, gap: 4,
  },
  swipeDeleteText: { ...Typography.caption, color: Colors.surface, fontWeight: '600' },
  swipeEdit: {
    backgroundColor: Colors.info, justifyContent: 'center', alignItems: 'center',
    width: 80, marginVertical: 4, marginRight: Spacing.md, borderRadius: BorderRadius.md, gap: 4,
  },
  swipeEditText: { ...Typography.caption, color: Colors.surface, fontWeight: '600' },
  productHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  productName: { ...Typography.body, fontWeight: '600', color: Colors.text, flex: 1 },
  productFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  productPrice: { ...Typography.body, fontWeight: '700', color: Colors.text },
  productMeta: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  productSize: { ...Typography.caption, color: Colors.accent, fontWeight: '600' },
  productFiring: { ...Typography.caption, color: Colors.textMuted },

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
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.md },
  optionChip: {
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  optionChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  optionText: { ...Typography.bodySmall, color: Colors.textSecondary },
  optionTextActive: { color: Colors.surface },

  recipeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  addRecipeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addRecipeText: { ...Typography.bodySmall, color: Colors.primary, fontWeight: '600' },

  inlineForm: { marginBottom: Spacing.sm, padding: Spacing.sm },
  inlineLabel: { ...Typography.label, color: Colors.textSecondary, marginBottom: 4 },
  inlineRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  inlineAddBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
  },
  inlineAddBtnText: { ...Typography.body, color: Colors.surface, fontWeight: '600' },
  recipeItem: { marginBottom: Spacing.xs },
  recipeItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recipeItemName: { ...Typography.bodySmall, fontWeight: '600', color: Colors.text },
  recipeItemStage: { ...Typography.caption, color: Colors.textSecondary },
  recipeItemRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  recipeItemQty: { ...Typography.bodySmall, color: Colors.textSecondary },

  selectList: { maxHeight: 200, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.sm },
  selectItem: { padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  selectItemActive: { backgroundColor: Colors.accentLight },
  selectText: { ...Typography.body, color: Colors.text },
  selectTextActive: { fontWeight: '600', color: Colors.primary },

  saveBtn: {
    flex: 1, backgroundColor: Colors.primary, borderRadius: BorderRadius.sm,
    paddingVertical: 14, alignItems: 'center',
  },
  saveBtnText: { ...Typography.body, fontWeight: '600', color: Colors.surface },
  deleteBtn: {
    width: 50, borderWidth: 1, borderColor: Colors.error, borderRadius: BorderRadius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  weightsBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: Colors.primary, borderRadius: BorderRadius.sm, paddingVertical: 14,
  },
  weightsBtnText: { ...Typography.body, color: Colors.primary, fontWeight: '600' },

  // Ağırlık profili
  weightRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  weightStageInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  weightStageNum: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.surfaceVariant, textAlign: 'center',
    ...Typography.caption, fontWeight: '700', color: Colors.textSecondary,
    lineHeight: 22,
  },
  weightStageLabel: { ...Typography.bodySmall, color: Colors.text, fontWeight: '500' },
  weightInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  weightInput: {
    ...Typography.body, color: Colors.text, textAlign: 'right',
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 8,
    minWidth: 80,
  },
  weightUnit: { ...Typography.bodySmall, color: Colors.textSecondary, width: 18 },

  calcCard: { marginTop: Spacing.md, gap: Spacing.xs },
  calcTitle: { ...Typography.label, color: Colors.textSecondary, marginBottom: 4 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  calcRowHighlight: {
    backgroundColor: Colors.accentLight, marginHorizontal: -Spacing.sm, paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm, paddingVertical: 6, marginVertical: 2,
  },
  calcLabel: { ...Typography.bodySmall, color: Colors.textSecondary },
  calcValue: { ...Typography.bodySmall, color: Colors.text, fontWeight: '600' },

  detailCard: { gap: Spacing.sm },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { ...Typography.bodySmall, color: Colors.textSecondary },
  detailValue: { ...Typography.bodySmall, color: Colors.text, fontWeight: '500' },

  stageSectionLabel: { ...Typography.caption, color: Colors.textMuted, fontWeight: '600', marginTop: Spacing.sm, marginBottom: 4 },
  emptyText: { ...Typography.body, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.md },
});
