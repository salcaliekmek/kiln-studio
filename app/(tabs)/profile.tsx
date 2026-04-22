import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Switch, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Spacing, Typography, BorderRadius } from '../../src/constants/theme';
import { Card } from '../../src/components/Card';
import {
  getProfile, saveProfile, AppProfile, PROFILE_DEFAULTS,
  getElectricityPrices, setElectricityPrice, deleteElectricityPrice,
} from '../../src/services/settings';
import { resetAllData } from '../../src/db/database';
import { getKilns, addKiln, deleteKiln } from '../../src/services/kilns';
import { ElectricityPrice, Kiln, ProductionStage } from '../../src/types';

const ALL_STAGES: ProductionStage[] = [
  'casting','drying','bisque','bisque_done',
  'glazing','glaze_firing',
  'decal','decal_firing','sanding','finished',
];

const STAGE_LABELS: Record<ProductionStage, string> = {
  casting: 'Döküm',
  drying: 'Kurutma',
  bisque: 'Bisküvi Pişirimi',
  bisque_done: 'Bisküvi Bitti',
  glazing: 'Sırlama',
  glaze_firing: 'Sır Pişirimi',
  glaze_done: 'Sır Bitti',
  decal: 'Dekal',
  decal_firing: 'Dekal Pişirimi',
  sanding: 'Son Zımparalama',
  finished: 'Satışa Hazır',
};

const FORCED_STAGES: ProductionStage[] = ['casting', 'finished'];

export default function ProfileScreen() {
  const [ownerName, setOwnerName] = useState('');
  const [studioName, setStudioName] = useState('Onni Studio');
  const [collections, setCollections] = useState<string[]>([...PROFILE_DEFAULTS.active_collections]);
  const [activeStages, setActiveStages] = useState<ProductionStage[]>([...PROFILE_DEFAULTS.active_stages]);
  const [electricityPrices, setElectricityPrices] = useState<ElectricityPrice[]>([]);
  const [newElecYear, setNewElecYear]   = useState(new Date().getFullYear().toString());
  const [newElecMonth, setNewElecMonth] = useState((new Date().getMonth() + 1).toString());
  const [newElecPrice, setNewElecPrice] = useState('');
  const [kilns, setKilns] = useState<Kiln[]>([]);
  const [newCollection, setNewCollection] = useState('');
  const [newKilnName, setNewKilnName] = useState('');
  const [newKilnPower, setNewKilnPower] = useState('');
  const [showAddKiln, setShowAddKiln] = useState(false);

  const load = useCallback(async () => {
    const [profile, kilnList, elecPrices] = await Promise.all([getProfile(), getKilns(), getElectricityPrices()]);
    setOwnerName(profile.owner_name);
    setStudioName(profile.studio_name);
    setCollections(profile.active_collections);
    setActiveStages(profile.active_stages);
    setElectricityPrices(elecPrices);
    setKilns(kilnList);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!studioName.trim()) return Alert.alert('Hata', 'Stüdyo adı boş bırakılamaz');
    try {
      await saveProfile({
        owner_name: ownerName.trim(),
        studio_name: studioName.trim(),
        active_collections: collections.filter(c => c.trim()),
        active_stages: activeStages,
      });
      router.back();
    } catch {
      Alert.alert('Hata', 'Profil kaydedilemedi');
    }
  }

  function addCollection() {
    const trimmed = newCollection.trim();
    if (!trimmed) return;
    if (collections.includes(trimmed)) return Alert.alert('', 'Bu koleksiyon zaten var');
    setCollections(prev => [...prev, trimmed]);
    setNewCollection('');
  }

  function removeCollection(name: string) {
    setCollections(prev => prev.filter(c => c !== name));
  }

  function toggleStage(stage: ProductionStage) {
    if (FORCED_STAGES.includes(stage)) return;
    setActiveStages(prev =>
      prev.includes(stage) ? prev.filter(s => s !== stage) : [...prev, stage].sort((a, b) => ALL_STAGES.indexOf(a) - ALL_STAGES.indexOf(b))
    );
  }

  async function handleAddKiln() {
    if (!newKilnName.trim()) return Alert.alert('Hata', 'Fırın adı girin');
    const power = parseFloat(newKilnPower);
    if (!power) return Alert.alert('Hata', 'kWh değeri girin');
    try {
      const id = await addKiln({ name: newKilnName.trim(), power_kw: power });
      setKilns(prev => [...prev, { id, name: newKilnName.trim(), power_kw: power }]);
      setNewKilnName('');
      setNewKilnPower('');
      setShowAddKiln(false);
    } catch {
      Alert.alert('Hata', 'Fırın eklenemedi');
    }
  }

  function showMonthPicker() {
    Alert.alert('Ay Seçin', undefined, [
      ...MONTH_LABELS.map((label, i) => ({
        text: label,
        onPress: () => setNewElecMonth((i + 1).toString()),
      })),
      { text: 'İptal', style: 'cancel' as const },
    ]);
  }

  async function handleAddElectricityPrice() {
    const year  = parseInt(newElecYear);
    const month = parseInt(newElecMonth);
    const price = parseFloat(newElecPrice);
    if (!year || year < 2000 || year > 2100) return Alert.alert('Hata', 'Geçerli bir yıl girin');
    if (!month || month < 1 || month > 12)   return Alert.alert('Hata', 'Ay seçin');
    if (!price || price <= 0)                 return Alert.alert('Hata', 'Geçerli bir fiyat girin');
    await setElectricityPrice(year, month, price);
    setNewElecPrice('');
    const updated = await getElectricityPrices();
    setElectricityPrices(updated);
  }

  async function handleDeleteElecPrice(year: number, month: number) {
    await deleteElectricityPrice(year, month);
    setElectricityPrices(prev => prev.filter(p => !(p.year === year && p.month === month)));
  }

  async function handleDeleteKiln(kiln: Kiln) {
    Alert.alert('Fırını Sil', `"${kiln.name}" silinsin mi?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil', style: 'destructive',
        onPress: async () => {
          await deleteKiln(kiln.id);
          setKilns(prev => prev.filter(k => k.id !== kiln.id));
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Profil</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Kişisel Bilgiler */}
          <Text style={styles.sectionTitle}>Kişisel Bilgiler</Text>
          <Card style={styles.section}>
            <Text style={styles.fieldLabel}>Ad</Text>
            <TextInput
              style={styles.input}
              value={ownerName}
              onChangeText={setOwnerName}
              placeholder="Adınız..."
              placeholderTextColor={Colors.textMuted}
            />
            <Text style={styles.fieldLabel}>Stüdyo Adı</Text>
            <TextInput
              style={[styles.input, { marginBottom: 0 }]}
              value={studioName}
              onChangeText={setStudioName}
              placeholder="Onni Studio"
              placeholderTextColor={Colors.textMuted}
            />
          </Card>

          {/* Koleksiyonlar */}
          <Text style={styles.sectionTitle}>Koleksiyonlar</Text>
          <Card style={styles.section}>
            {collections.map((col, i) => (
              <View key={i} style={styles.listRow}>
                <View style={[styles.colDot, { backgroundColor: collectionColor(col) }]} />
                <Text style={styles.listLabel}>{col}</Text>
                <TouchableOpacity onPress={() => removeCollection(col)} style={styles.rowAction}>
                  <Ionicons name="trash-outline" size={16} color={Colors.error} />
                </TouchableOpacity>
              </View>
            ))}
            <View style={styles.addRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                value={newCollection}
                onChangeText={setNewCollection}
                placeholder="Yeni koleksiyon adı..."
                placeholderTextColor={Colors.textMuted}
                onSubmitEditing={addCollection}
                returnKeyType="done"
              />
              <TouchableOpacity style={styles.addBtn} onPress={addCollection}>
                <Ionicons name="add" size={20} color={Colors.surface} />
              </TouchableOpacity>
            </View>
          </Card>

          {/* Üretim Aşamaları */}
          <Text style={styles.sectionTitle}>Üretim Aşamaları</Text>
          <Card style={styles.section}>
            {ALL_STAGES.map((stage) => {
              const isActive = activeStages.includes(stage);
              const isForced = FORCED_STAGES.includes(stage);
              return (
                <View key={stage} style={styles.stageRow}>
                  <View style={[styles.stageDot, { backgroundColor: Colors.stages[stage] }]} />
                  <Text style={[styles.listLabel, { flex: 1 }]}>{STAGE_LABELS[stage]}</Text>
                  {isForced ? (
                    <Text style={styles.forcedText}>Zorunlu</Text>
                  ) : (
                    <Switch
                      value={isActive}
                      onValueChange={() => toggleStage(stage)}
                      trackColor={{ false: Colors.border, true: Colors.accent }}
                      thumbColor={isActive ? Colors.primary : Colors.textMuted}
                    />
                  )}
                </View>
              );
            })}
          </Card>

          {/* Maliyet Ayarları — Elektrik Fiyatı Geçmişi */}
          <Text style={styles.sectionTitle}>Elektrik Fiyatı Geçmişi</Text>
          <Card style={styles.section}>
            {electricityPrices.length === 0 && (
              <Text style={styles.emptyText}>Henüz fiyat girilmedi</Text>
            )}
            {electricityPrices.map(ep => (
              <View key={`${ep.year}-${ep.month}`} style={styles.listRow}>
                <Ionicons name="flash-outline" size={16} color={Colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.listLabel}>{MONTH_LABELS[ep.month - 1]} {ep.year}</Text>
                  <Text style={styles.listSub}>₺{ep.price_per_kwh.toFixed(2)}/kWh</Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleDeleteElecPrice(ep.year, ep.month)}
                  style={styles.rowAction}
                >
                  <Ionicons name="trash-outline" size={16} color={Colors.error} />
                </TouchableOpacity>
              </View>
            ))}

            {/* Yeni fiyat ekleme */}
            <View style={styles.elecAddRow}>
              <TouchableOpacity style={styles.elecMonthBtn} onPress={showMonthPicker}>
                <Text style={styles.elecMonthText}>
                  {MONTH_LABELS[parseInt(newElecMonth) - 1]}
                </Text>
                <Ionicons name="chevron-down" size={14} color={Colors.textSecondary} />
              </TouchableOpacity>
              <TextInput
                style={[styles.input, styles.elecYearInput]}
                value={newElecYear}
                onChangeText={setNewElecYear}
                keyboardType="number-pad"
                maxLength={4}
                placeholderTextColor={Colors.textMuted}
              />
              <TextInput
                style={[styles.input, styles.elecPriceInput]}
                value={newElecPrice}
                onChangeText={setNewElecPrice}
                placeholder="₺/kWh"
                keyboardType="decimal-pad"
                placeholderTextColor={Colors.textMuted}
              />
              <TouchableOpacity style={styles.addBtn} onPress={handleAddElectricityPrice}>
                <Ionicons name="add" size={20} color={Colors.surface} />
              </TouchableOpacity>
            </View>
            <Text style={styles.settingHint}>
              Fırın pişirim maliyetleri, pişirimin yapıldığı ay/yıl fiyatından hesaplanır.
            </Text>
          </Card>

          {/* Fırınlar */}
          <Text style={styles.sectionTitle}>Fırınlar</Text>
          <Card style={styles.section}>
            {kilns.length === 0 && (
              <Text style={styles.emptyText}>Henüz fırın tanımlanmamış</Text>
            )}
            {kilns.map(kiln => (
              <View key={kiln.id} style={styles.listRow}>
                <Ionicons name="flame-outline" size={18} color={Colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.listLabel}>{kiln.name}</Text>
                  <Text style={styles.listSub}>{kiln.power_kw} kWh</Text>
                </View>
                <TouchableOpacity onPress={() => handleDeleteKiln(kiln)} style={styles.rowAction}>
                  <Ionicons name="trash-outline" size={16} color={Colors.error} />
                </TouchableOpacity>
              </View>
            ))}

            {showAddKiln ? (
              <View style={styles.addKilnForm}>
                <TextInput
                  style={styles.input}
                  value={newKilnName}
                  onChangeText={setNewKilnName}
                  placeholder="Fırın adı (örn. Fırın 1)"
                  placeholderTextColor={Colors.textMuted}
                />
                <TextInput
                  style={[styles.input, { marginBottom: Spacing.sm }]}
                  value={newKilnPower}
                  onChangeText={setNewKilnPower}
                  placeholder="Elektrik gücü (kWh)"
                  keyboardType="decimal-pad"
                  placeholderTextColor={Colors.textMuted}
                />
                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                  <TouchableOpacity style={[styles.addBtn, { flex: 1, borderRadius: BorderRadius.sm }]} onPress={handleAddKiln}>
                    <Text style={{ ...Typography.bodySmall, color: Colors.surface, fontWeight: '600' }}>Ekle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.addBtn, { flex: 1, borderRadius: BorderRadius.sm, backgroundColor: Colors.surfaceVariant }]}
                    onPress={() => setShowAddKiln(false)}
                  >
                    <Text style={{ ...Typography.bodySmall, color: Colors.textSecondary }}>İptal</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.addRowBtn} onPress={() => setShowAddKiln(true)}>
                <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
                <Text style={styles.addRowBtnText}>Fırın Ekle</Text>
              </TouchableOpacity>
            )}
          </Card>

          {/* Tehlikeli Alan */}
          <Text style={[styles.sectionTitle, { marginTop: Spacing.xl, color: Colors.error }]}>Tehlikeli Alan</Text>
          <Card variant="outlined" style={{ borderColor: Colors.error + '40', gap: Spacing.sm }}>
            <Text style={{ ...Typography.bodySmall, color: Colors.textSecondary }}>
              Tüm hammadde, ürün, üretim, stok ve pişirim verileri silinir. Uygulama ayarları (stüdyo adı, aşamalar vb.) korunur. Bu işlem geri alınamaz.
            </Text>
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={() => {
                Alert.alert(
                  'Tüm Verileri Sıfırla',
                  'Tüm hammadde, ürün, üretim partisi, stok ve pişirim kayıtları kalıcı olarak silinecek. Emin misin?',
                  [
                    { text: 'İptal', style: 'cancel' },
                    {
                      text: 'Evet, Sıfırla',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await resetAllData();
                          Alert.alert('Tamamlandı', 'Tüm veriler silindi.');
                        } catch (e) {
                          Alert.alert('Hata', 'Veriler silinemedi.');
                        }
                      },
                    },
                  ]
                );
              }}
            >
              <Ionicons name="trash-outline" size={18} color={Colors.error} />
              <Text style={styles.resetBtnText}>Tüm Verileri Sıfırla</Text>
            </TouchableOpacity>
          </Card>

          <View style={{ height: Spacing.xl }} />
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>Kaydet</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const MONTH_LABELS = [
  'Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
  'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık',
];

const COLLECTION_PALETTE = [
  '#3E6B8B','#4E8B6B','#8B4E6B','#6B6B3E','#6B6B6B',
  '#7C3AED','#B45309','#047857','#DC2626','#0369A1',
];

function collectionColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % COLLECTION_PALETTE.length;
  return COLLECTION_PALETTE[hash];
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { ...Typography.h2, color: Colors.text },
  scroll: { flex: 1 },
  content: { padding: Spacing.md },

  sectionTitle: {
    ...Typography.label, color: Colors.textSecondary,
    marginBottom: Spacing.sm, marginTop: Spacing.lg,
  },
  section: { gap: Spacing.sm },

  fieldLabel: { ...Typography.label, color: Colors.textSecondary, marginBottom: 4 },
  input: {
    ...Typography.body, color: Colors.text,
    backgroundColor: Colors.surfaceVariant, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.md, paddingVertical: 10,
    marginBottom: Spacing.sm,
  },

  listRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 4 },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
  colDot: { width: 10, height: 10, borderRadius: 5 },
  stageDot: { width: 10, height: 10, borderRadius: 5 },
  listLabel: { ...Typography.body, color: Colors.text },
  listSub: { ...Typography.caption, color: Colors.textSecondary },
  rowAction: { padding: 4 },
  forcedText: { ...Typography.caption, color: Colors.textMuted, fontStyle: 'italic' },

  addRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center', marginTop: Spacing.xs },
  addBtn: {
    backgroundColor: Colors.primary, width: 40, height: 40,
    borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center',
  },
  addKilnForm: { marginTop: Spacing.sm },
  addRowBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.sm, marginTop: Spacing.xs,
  },
  addRowBtnText: { ...Typography.bodySmall, color: Colors.primary, fontWeight: '600' },

  emptyText: { ...Typography.bodySmall, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.xs },
  settingHint: { ...Typography.caption, color: Colors.textMuted, marginTop: Spacing.xs, lineHeight: 16 },

  elecAddRow: {
    flexDirection: 'row', gap: Spacing.xs, alignItems: 'center', marginTop: Spacing.sm,
  },
  elecMonthBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.surfaceVariant, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 10,
    minWidth: 90,
  },
  elecMonthText: { ...Typography.bodySmall, color: Colors.text, flex: 1 },
  elecYearInput: { width: 84, marginBottom: 0, textAlign: 'center' as const },
  elecPriceInput: { flex: 1, marginBottom: 0, minWidth: 70, maxWidth: 110 },

  footer: {
    padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.sm,
    paddingVertical: 14, alignItems: 'center',
  },
  saveBtnText: { ...Typography.body, fontWeight: '600', color: Colors.surface },

  resetBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: Colors.error, borderRadius: BorderRadius.sm,
    paddingVertical: 12,
  },
  resetBtnText: { ...Typography.body, color: Colors.error, fontWeight: '600' },
});
