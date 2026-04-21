import { getDatabase } from '../db/database';
import { LiquidClayBatch, LiquidClayPigmentItem } from '../types';
import { getColorRecipeComponents } from './colors';

export async function getLiquidClayBatches(): Promise<LiquidClayBatch[]> {
  const db = await getDatabase();
  return db.getAllAsync<LiquidClayBatch>(
    `SELECT lcb.*,
            m.name as clay_material_name,
            cr.name as color_recipe_name
     FROM liquid_clay_batches lcb
     JOIN materials m ON m.id = lcb.clay_material_id
     LEFT JOIN color_recipes cr ON cr.id = lcb.color_recipe_id
     ORDER BY lcb.created_at DESC`
  );
}

export async function getLiquidClayBatch(id: number): Promise<LiquidClayBatch | null> {
  const db = await getDatabase();
  const batch = await db.getFirstAsync<LiquidClayBatch>(
    `SELECT lcb.*, m.name as clay_material_name, cr.name as color_recipe_name
     FROM liquid_clay_batches lcb
     JOIN materials m ON m.id = lcb.clay_material_id
     LEFT JOIN color_recipes cr ON cr.id = lcb.color_recipe_id
     WHERE lcb.id = ?`,
    [id]
  );
  if (!batch) return null;
  if (batch.color_recipe_id) {
    batch.pigment_items = await calculatePigmentItems(
      batch.color_recipe_id,
      batch.clay_quantity
    );
  }
  return batch;
}

/**
 * Renk reçetesindeki pigment oranlarını verilen çamur miktarına göre ölçekler.
 * Reçete 1000gr çamur için tanımlı; clay_quantity / 1000 ile çarpılır.
 */
export async function calculatePigmentItems(
  colorRecipeId: number,
  clayQuantityGr: number
): Promise<LiquidClayPigmentItem[]> {
  const components = await getColorRecipeComponents(colorRecipeId);
  const scale = clayQuantityGr / 1000;
  const db = await getDatabase();

  return Promise.all(
    components.map(async (c) => {
      const mat = await db.getFirstAsync<{ cost_per_unit: number; unit: string }>(
        'SELECT cost_per_unit, unit FROM materials WHERE id = ?',
        [c.material_id]
      );
      const scaledQty = c.quantity * scale;
      // cost_per_unit gram bazlı ise direkt kullan
      const cost = (mat?.cost_per_unit ?? 0) * scaledQty;
      return {
        material_id: c.material_id,
        material_name: c.material_name ?? '',
        quantity: scaledQty,
        cost,
      };
    })
  );
}

/**
 * Toplam maliyet hesabı:
 * - Kuru çamur maliyeti (clay_quantity × cost_per_unit)
 * - Pigment maliyetleri (ölçeklenmiş)
 */
export async function calculateBatchCost(
  clayMaterialId: number,
  clayQuantityGr: number,
  colorRecipeId?: number
): Promise<{ total_cost: number; cost_per_kg: number; pigment_items: LiquidClayPigmentItem[] }> {
  const db = await getDatabase();
  const clay = await db.getFirstAsync<{ cost_per_unit: number; unit: string }>(
    'SELECT cost_per_unit, unit FROM materials WHERE id = ?',
    [clayMaterialId]
  );

  // Çamur birim gr ise direkt, kg ise ×1000
  const clayGrCost = clay?.unit === 'kg'
    ? (clay.cost_per_unit / 1000) * clayQuantityGr
    : (clay?.cost_per_unit ?? 0) * clayQuantityGr;

  let pigmentCost = 0;
  let pigment_items: LiquidClayPigmentItem[] = [];

  if (colorRecipeId) {
    pigment_items = await calculatePigmentItems(colorRecipeId, clayQuantityGr);
    pigmentCost = pigment_items.reduce((s, p) => s + p.cost, 0);
  }

  const total_cost = clayGrCost + pigmentCost;
  // total_weight = clay + water (water cost 0)
  // cost_per_kg hesabı çağıran tarafta yapılır (su miktarı bilinmeli)
  return { total_cost, cost_per_kg: 0, pigment_items };
}

export async function addLiquidClayBatch(
  data: Omit<LiquidClayBatch, 'id' | 'created_at' | 'clay_material_name' | 'color_recipe_name' | 'pigment_items'>
): Promise<number> {
  const db = await getDatabase();
  let batchId = 0;

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO liquid_clay_batches
         (name, clay_material_id, clay_quantity, water_quantity, color_recipe_id,
          total_weight, available_quantity, total_cost, cost_per_kg, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        data.clay_material_id,
        data.clay_quantity,
        data.water_quantity,
        data.color_recipe_id ?? null,
        data.total_weight,
        data.available_quantity,
        data.total_cost,
        data.cost_per_kg,
        data.notes ?? null,
      ]
    );
    batchId = result.lastInsertRowId;

    // Kuru çamur stoğunu düş (gram → malzeme birimine çevir)
    const clay = await db.getFirstAsync<{ unit: string }>(
      'SELECT unit FROM materials WHERE id = ?', [data.clay_material_id]
    );
    const deductQty = clay?.unit === 'kg' ? data.clay_quantity / 1000 : data.clay_quantity;
    await db.runAsync(
      'UPDATE materials SET stock_quantity = stock_quantity - ? WHERE id = ?',
      [deductQty, data.clay_material_id]
    );

    // Pigment stoklarını düş
    if (data.color_recipe_id) {
      const items = await calculatePigmentItems(data.color_recipe_id, data.clay_quantity);
      for (const item of items) {
        await db.runAsync(
          'UPDATE materials SET stock_quantity = stock_quantity - ? WHERE id = ?',
          [item.quantity, item.material_id]
        );
      }
    }
  });

  return batchId;
}

export async function recalculateLiquidClayBatch(id: number): Promise<void> {
  const db = await getDatabase();
  const batch = await db.getFirstAsync<{
    clay_quantity: number; water_quantity: number;
    color_recipe_id: number | null; total_weight: number; available_quantity: number; total_cost: number;
  }>('SELECT * FROM liquid_clay_batches WHERE id = ?', [id]);
  if (!batch) return;

  let pigmentGr = 0;
  if (batch.color_recipe_id) {
    const items = await calculatePigmentItems(batch.color_recipe_id, batch.clay_quantity);
    pigmentGr = items.reduce((s, p) => s + p.quantity, 0);
  }

  const rawWeight = batch.clay_quantity + batch.water_quantity + pigmentGr;
  const newTotalWeight = Math.ceil(rawWeight / 500) * 500;

  // Eğer hiç kullanılmamışsa available_quantity da güncelle
  const wasFullyAvailable = batch.available_quantity >= batch.total_weight;
  const newAvailableQty = wasFullyAvailable ? newTotalWeight : batch.available_quantity;
  const newCostPerKg = newTotalWeight > 0 ? (batch.total_cost / newTotalWeight) * 1000 : 0;

  await db.runAsync(
    `UPDATE liquid_clay_batches
     SET total_weight = ?, available_quantity = ?, cost_per_kg = ?
     WHERE id = ?`,
    [newTotalWeight, newAvailableQty, newCostPerKg, id]
  );
}

export async function useLiquidClay(batchId: number, usedGrams: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE liquid_clay_batches SET available_quantity = MAX(0, available_quantity - ?) WHERE id = ?',
    [usedGrams, batchId]
  );
}

export async function deleteLiquidClayBatch(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM liquid_clay_batches WHERE id = ?', [id]);
}
