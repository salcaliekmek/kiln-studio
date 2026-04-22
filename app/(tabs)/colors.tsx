import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, TextInput, Modal, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../../src/constants/theme';
import { Card } from '../../src/components/Card';
import { EmptyState } from '../../src/components/EmptyState';
import { getColorRecipes, addColorRecipe, updateColorRecipe, deleteColorRecipe, getColorRecipe } from '../../src/services/colors';
import { useFocusEffect } from 'expo-router';
import { getMaterials } from '../../src/services/materials';
import { ColorRecipe, ColorRecipeComponent, Material } from '../../src/types';

export default function ColorsScreen() {
  const [recipes, setRecipes] = useState<ColorRecipe[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [selected, setSelected] = useState<ColorRecipe | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const swipeableRefs = useRef<Map<number, Swipeable>>(new Map());

  // Add form
  const [form, setForm] = useState({ name: '', description: '', base_clay_quantity: '1000' });
  const [components, setComponents] = useState<Omit<ColorRecipeComponent, 'id' | 'color_recipe_id'>[]>([]);
  const [showAddComp, setShowAddComp] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [compQty, setCompQty] = useState('');

  // Edit form
  const [editForm, setEditForm] = useState({ name: '', description: '', base_clay_quantity: '1000' });
  const [editComponents, setEditComponents] = useState<Omit<ColorRecipeComponent, 'id' | 'color_recipe_id'>[]>([]);
  const [showEditComp, setShowEditComp] = useState(false);
  const [editSelMaterial, setEditSelMaterial] = useState<Material | null>(null);
  const [editCompQty, setEditCompQty] = useState('');

  const load = useCallback(async () => {
    const [r, m] = await Promise.all([getColorRecipes(), getMaterials('pigment')]);
    setRecipes(r);
    setMaterials(m);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function openDetail(recipe: ColorRecipe) {
    const full = await getColorRecipe(recipe.id);
    setSelected(full);
    setShowDetail(true);
  }

  async function handleAdd() {
    if (!form.name.trim()) return Alert.alert('Hata', 'Renk adı gerekli');
    const clayQty = parseFloat(form.base_clay_quantity);
    if (!clayQty) return Alert.alert('Hata', 'Baz çamur miktarı gerekli');
    try {
      await addColorRecipe(
        { name: form.name.trim(), description: form.description || undefined, base_clay_quantity: clayQty },
        components
      );
      setShowAdd(false);
      resetForm();
      load();
    } catch (e) {
      Alert.alert('Hata', 'Renk reçetesi eklenemedi');
    }
  }

  function resetForm() {
    setForm({ name: '', description: '', base_clay_quantity: '1000' });
    setComponents([]);
    setShowAddComp(false);
    setSelectedMaterial(null);
    setCompQty('');
  }

  function handleAddComponent() {
    if (!selectedMaterial) return Alert.alert('Hata', 'Pigment seçin');
    const qty = parseFloat(compQty);
    if (!qty) return Alert.alert('Hata', 'Miktar girin');
    setComponents(prev => [...prev, { material_id: selectedMaterial.id, material_name: selectedMaterial.name, quantity: qty }]);
    setSelectedMaterial(null);
    setCompQty('');
    setShowAddComp(false); // inline formu kapat
  }

  function openEdit(recipe: ColorRecipe) {
    swipeableRefs.current.get(recipe.id)?.close();
    getColorRecipe(recipe.id).then(full => {
      if (!full) return;
      setSelected(full);
      setEditForm({
        name: full.name,
        description: full.description ?? '',
        base_clay_quantity: String(full.base_clay_quantity),
      });
      setEditComponents(
        (full.components ?? []).map(c => ({
          material_id: c.material_id,
          material_name: c.material_name,
          quantity: c.quantity,
        }))
      );
      setShowEditComp(false);
      setEditSelMaterial(null);
      setEditCompQty('');
      setShowEdit(true);
    });
  }

  async function handleSaveEdit() {
    if (!selected) return;
    if (!editForm.name.trim()) return Alert.alert('Hata', 'Renk adı gerekli');
    const clayQty = parseFloat(editForm.base_clay_quantity);
    if (!clayQty) return Alert.alert('Hata', 'Baz çamur miktarı gerekli');
    try {
      await updateColorRecipe(
        selected.id,
        { name: editForm.name.trim(), description: editForm.description || undefined, base_clay_quantity: clayQty },
        editComponents.map(c => ({ material_id: c.material_id, quantity: c.quantity }))
      );
      setShowEdit(false);
      load();
    } catch {
      Alert.alert('Hata', 'Renk reçetesi güncellenemedi');
    }
  }

  function handleAddEditComponent() {
    if (!editSelMaterial) return Alert.alert('Hata', 'Pigment seçin');
    const qty = parseFloat(editCompQty);
    if (!qty) return Alert.alert('Hata', 'Miktar girin');
    setEditComponents(prev => [...prev, { material_id: editSelMaterial.id, material_name: editSelMaterial.name, quantity: qty }]);
    setEditSelMaterial(null);
    setEditCompQty('');
    setShowEditComp(false);
  }

  function handleDelete(recipe: ColorRecipe) {
    Alert.alert('Renk Reçetesi Sil', `"${recipe.name}" silinsin mi?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil', style: 'destructive',
        onPress: async () => { await deleteColorRecipe(recipe.id); setShowDetail(false); load(); },
      },
    ]);
  }

  // Total pigment ratio display
  function getPigmentRatio(comps: typeof components, baseClay: number) {
    const total = comps.reduce((s, c) => s + c.quantity, 0);
    if (!baseClay || !total) return '';
    return `${total}gr pigment / ${baseClay}gr çamur (%${((total / baseClay) * 100).toFixed(1)})`;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Renk Reçeteleri</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Ionicons name="add" size={22} color={Colors.surface} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={recipes}
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
            <Card style={styles.recipeCard} onPress={() => openDetail(item)}>
              <View style={styles.recipeHeader}>
                <View style={styles.colorDot} />
                <Text style={styles.recipeName}>{item.name}</Text>
              </View>
              <Text style={styles.recipeBase}>{item.base_clay_quantity}gr baz çamur</Text>
              {item.description && <Text style={styles.recipeDesc}>{item.description}</Text>}
            </Card>
          </Swipeable>
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState icon="color-palette-outline" title="Renk reçetesi yok" subtitle="Yeni renk reçetesi eklemek için + butonuna dokunun" />
        }
      />

      {/* Add Recipe Modal */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet" onDismiss={() => { setShowAdd(false); resetForm(); }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Yeni Renk Reçetesi</Text>
              <TouchableOpacity onPress={() => { setShowAdd(false); resetForm(); }}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.fieldLabel}>Renk Adı</Text>
              <TextInput style={styles.input} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} placeholder="örn. Toz Pembesi, Hardal Sarısı..." placeholderTextColor={Colors.textMuted} />

              <Text style={styles.fieldLabel}>Baz Çamur Miktarı (gr)</Text>
              <TextInput style={styles.input} value={form.base_clay_quantity} onChangeText={v => setForm(f => ({ ...f, base_clay_quantity: v }))} keyboardType="decimal-pad" placeholderTextColor={Colors.textMuted} />

              <Text style={styles.fieldLabel}>Açıklama</Text>
              <TextInput style={[styles.input, styles.textarea]} value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} placeholder="Renk notu, ton açıklaması..." multiline placeholderTextColor={Colors.textMuted} />

              {/* Pigment components */}
              <View style={styles.compHeader}>
                <Text style={styles.fieldLabel}>Pigment Bileşenleri</Text>
                <TouchableOpacity
                  onPress={() => setShowAddComp(prev => !prev)}
                  style={styles.addCompBtn}
                >
                  <Ionicons name={showAddComp ? 'chevron-up' : 'add'} size={16} color={Colors.primary} />
                  <Text style={styles.addCompText}>{showAddComp ? 'Kapat' : 'Pigment Ekle'}</Text>
                </TouchableOpacity>
              </View>

              {/* Inline pigment seçici */}
              {showAddComp && (
                <Card variant="outlined" style={styles.inlineForm}>
                  {materials.length === 0 ? (
                    <View style={styles.noMaterials}>
                      <Ionicons name="information-circle-outline" size={24} color={Colors.textMuted} />
                      <Text style={styles.noMaterialsText}>Hammadde ekranından pigment tipinde hammadde ekleyin.</Text>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.inlineLabel}>Pigment Seç</Text>
                      {materials.map(m => (
                        <TouchableOpacity
                          key={m.id}
                          style={[styles.selectItem, selectedMaterial?.id === m.id && styles.selectItemActive]}
                          onPress={() => setSelectedMaterial(m)}
                        >
                          <Text style={[styles.selectText, selectedMaterial?.id === m.id && styles.selectTextActive]}>{m.name}</Text>
                          <Text style={styles.stockText}>{m.stock_quantity}gr stok</Text>
                        </TouchableOpacity>
                      ))}
                      <Text style={[styles.inlineLabel, { marginTop: Spacing.sm }]}>Miktar (gr)</Text>
                      <View style={styles.inlineRow}>
                        <TextInput
                          style={[styles.input, { flex: 1, marginBottom: 0 }]}
                          value={compQty}
                          onChangeText={setCompQty}
                          keyboardType="decimal-pad"
                          placeholder="gram"
                          placeholderTextColor={Colors.textMuted}
                        />
                        <TouchableOpacity style={styles.inlineAddBtn} onPress={handleAddComponent}>
                          <Text style={styles.inlineAddBtnText}>Ekle</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </Card>
              )}

              {components.length > 0 && (
                <Card variant="filled" style={styles.ratioCard}>
                  <Text style={styles.ratioText}>
                    {getPigmentRatio(components, parseFloat(form.base_clay_quantity) || 1000)}
                  </Text>
                </Card>
              )}

              {components.map((comp, i) => (
                <Card key={i} variant="outlined" style={styles.compItem}>
                  <View style={styles.compRow}>
                    <Text style={styles.compName}>{comp.material_name}</Text>
                    <View style={styles.compRight}>
                      <Text style={styles.compQty}>{comp.quantity}gr</Text>
                      <TouchableOpacity onPress={() => setComponents(prev => prev.filter((_, idx) => idx !== i))}>
                        <Ionicons name="close-circle" size={18} color={Colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </Card>
              ))}
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
              <Text style={styles.modalTitle}>Reçeteyi Düzenle</Text>
              <TouchableOpacity onPress={() => setShowEdit(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.fieldLabel}>Renk Adı</Text>
              <TextInput style={styles.input} value={editForm.name} onChangeText={v => setEditForm(f => ({ ...f, name: v }))} placeholder="örn. Toz Pembesi..." placeholderTextColor={Colors.textMuted} />

              <Text style={styles.fieldLabel}>Baz Çamur Miktarı (gr)</Text>
              <TextInput style={styles.input} value={editForm.base_clay_quantity} onChangeText={v => setEditForm(f => ({ ...f, base_clay_quantity: v }))} keyboardType="decimal-pad" placeholderTextColor={Colors.textMuted} />

              <Text style={styles.fieldLabel}>Açıklama</Text>
              <TextInput style={[styles.input, styles.textarea]} value={editForm.description} onChangeText={v => setEditForm(f => ({ ...f, description: v }))} placeholder="Renk notu..." multiline placeholderTextColor={Colors.textMuted} />

              <View style={styles.compHeader}>
                <Text style={styles.fieldLabel}>Pigment Bileşenleri</Text>
                <TouchableOpacity onPress={() => setShowEditComp(p => !p)} style={styles.addCompBtn}>
                  <Ionicons name={showEditComp ? 'chevron-up' : 'add'} size={16} color={Colors.primary} />
                  <Text style={styles.addCompText}>{showEditComp ? 'Kapat' : 'Pigment Ekle'}</Text>
                </TouchableOpacity>
              </View>

              {showEditComp && (
                <Card variant="outlined" style={styles.inlineForm}>
                  {materials.length === 0 ? (
                    <View style={styles.noMaterials}>
                      <Ionicons name="information-circle-outline" size={24} color={Colors.textMuted} />
                      <Text style={styles.noMaterialsText}>Hammadde ekranından pigment tipinde hammadde ekleyin.</Text>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.inlineLabel}>Pigment Seç</Text>
                      {materials.map(m => (
                        <TouchableOpacity
                          key={m.id}
                          style={[styles.selectItem, editSelMaterial?.id === m.id && styles.selectItemActive]}
                          onPress={() => setEditSelMaterial(m)}
                        >
                          <Text style={[styles.selectText, editSelMaterial?.id === m.id && styles.selectTextActive]}>{m.name}</Text>
                          <Text style={styles.stockText}>{m.stock_quantity}gr stok</Text>
                        </TouchableOpacity>
                      ))}
                      <Text style={[styles.inlineLabel, { marginTop: Spacing.sm }]}>Miktar (gr)</Text>
                      <View style={styles.inlineRow}>
                        <TextInput
                          style={[styles.input, { flex: 1, marginBottom: 0 }]}
                          value={editCompQty}
                          onChangeText={setEditCompQty}
                          keyboardType="decimal-pad"
                          placeholder="gram"
                          placeholderTextColor={Colors.textMuted}
                        />
                        <TouchableOpacity style={styles.inlineAddBtn} onPress={handleAddEditComponent}>
                          <Text style={styles.inlineAddBtnText}>Ekle</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </Card>
              )}

              {editComponents.length > 0 && (
                <Card variant="filled" style={styles.ratioCard}>
                  <Text style={styles.ratioText}>
                    {getPigmentRatio(editComponents, parseFloat(editForm.base_clay_quantity) || 1000)}
                  </Text>
                </Card>
              )}

              {editComponents.map((comp, i) => (
                <Card key={i} variant="outlined" style={styles.compItem}>
                  <View style={styles.compRow}>
                    <Text style={styles.compName}>{comp.material_name}</Text>
                    <View style={styles.compRight}>
                      <Text style={styles.compQty}>{comp.quantity}gr</Text>
                      <TouchableOpacity onPress={() => setEditComponents(prev => prev.filter((_, idx) => idx !== i))}>
                        <Ionicons name="close-circle" size={18} color={Colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </Card>
              ))}
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
      <Modal visible={showDetail} animationType="slide" presentationStyle="pageSheet" onDismiss={() => setShowDetail(false)}>
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
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Baz Çamur</Text>
                  <Text style={styles.detailValue}>{selected.base_clay_quantity}gr</Text>
                </View>
                {selected.description && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Not</Text>
                    <Text style={styles.detailValue}>{selected.description}</Text>
                  </View>
                )}
              </Card>

              <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>Pigment Bileşenleri</Text>
              {(selected.components?.length ?? 0) === 0 ? (
                <Text style={styles.emptyText}>Pigment bileşeni tanımlanmamış</Text>
              ) : (
                <>
                  {selected.components?.map(comp => (
                    <Card key={comp.id} variant="outlined" style={styles.compItem}>
                      <View style={styles.compRow}>
                        <Text style={styles.compName}>{comp.material_name}</Text>
                        <Text style={styles.compQty}>{comp.quantity}gr</Text>
                      </View>
                    </Card>
                  ))}
                  <Card variant="filled" style={styles.ratioCardBottom}>
                    <Text style={styles.ratioText}>
                      Toplam: {selected.components?.reduce((s, c) => s + c.quantity, 0)}gr pigment / {selected.base_clay_quantity}gr çamur
                    </Text>
                    <Text style={styles.ratioPercent}>
                      (%{((selected.components?.reduce((s, c) => s + c.quantity, 0) ?? 0) / selected.base_clay_quantity * 100).toFixed(1)} pigment oranı)
                    </Text>
                  </Card>
                </>
              )}
            </ScrollView>
          )}
          <View style={styles.modalFooter}>
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

  swipeDelete: {
    backgroundColor: Colors.error, justifyContent: 'center', alignItems: 'center',
    width: 80, marginBottom: Spacing.sm, borderRadius: BorderRadius.md,
    gap: 4,
  },
  swipeDeleteText: { ...Typography.caption, color: Colors.surface, fontWeight: '600' },
  swipeEdit: {
    backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center',
    width: 80, marginBottom: Spacing.sm, borderRadius: BorderRadius.md,
    gap: 4,
  },
  swipeEditText: { ...Typography.caption, color: Colors.surface, fontWeight: '600' },

  recipeCard: { gap: Spacing.xs },
  recipeHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  colorDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: Colors.accent },
  recipeName: { ...Typography.body, fontWeight: '600', color: Colors.text },
  recipeBase: { ...Typography.caption, color: Colors.textSecondary },
  recipeDesc: { ...Typography.caption, color: Colors.textMuted },

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

  compHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  addCompBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addCompText: { ...Typography.bodySmall, color: Colors.primary, fontWeight: '600' },

  ratioCard: { marginBottom: Spacing.sm },
  ratioCardBottom: { marginTop: Spacing.sm },
  ratioText: { ...Typography.bodySmall, color: Colors.primaryLight, fontWeight: '500' },
  ratioPercent: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },

  compItem: { marginBottom: Spacing.xs },
  compRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  compName: { ...Typography.bodySmall, fontWeight: '600', color: Colors.text },
  compRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  compQty: { ...Typography.bodySmall, color: Colors.textSecondary },

  selectItem: {
    padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.divider,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  selectItemActive: { backgroundColor: Colors.accentLight },
  selectText: { ...Typography.body, color: Colors.text },
  selectTextActive: { fontWeight: '600', color: Colors.primary },
  stockText: { ...Typography.caption, color: Colors.textMuted },

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

  detailCard: { gap: Spacing.sm },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { ...Typography.bodySmall, color: Colors.textSecondary },
  detailValue: { ...Typography.bodySmall, color: Colors.text, fontWeight: '500', flex: 1, textAlign: 'right' },

  noMaterials: { alignItems: 'center', padding: Spacing.xl, gap: Spacing.sm },
  noMaterialsText: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },
  noMaterialsHint: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center' },

  inlineForm: { marginBottom: Spacing.sm, padding: Spacing.sm, gap: Spacing.xs },
  inlineLabel: { ...Typography.label, color: Colors.textSecondary, marginBottom: 4 },
  inlineRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  inlineAddBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
  },
  inlineAddBtnText: { ...Typography.body, color: Colors.surface, fontWeight: '600' },
  emptyText: { ...Typography.body, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.md },
});
