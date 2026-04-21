import { getDatabase } from '../db/database';
import { KilnFiring, KilnFiringItem, KilnStatus, FiringType, ProductionStage } from '../types';
import { updateProductionItemStage } from './production';
import { getElectricityPriceForDate } from './settings';

export interface FiringCostDetail {
  total_electricity_cost: number;
  electricity_price_per_kwh: number;
  /** production_item_id → maliyet */
  item_costs: Record<number, { total_cost: number; per_unit_cost: number }>;
  missing_electricity_price: boolean;
  missing_kiln_or_duration: boolean;
}

const FIRING_STAGE_MAP: Record<FiringType, { from: ProductionStage; to: ProductionStage }> = {
  bisque: { from: 'bisque',        to: 'bisque_done' },
  glaze:  { from: 'glaze_firing',  to: 'glaze_done'  },
  decal:  { from: 'decal_firing',  to: 'sanding'     },
};

export async function getKilnFirings(): Promise<KilnFiring[]> {
  const db = await getDatabase();
  return db.getAllAsync<KilnFiring>(
    'SELECT * FROM kiln_firings ORDER BY date DESC, created_at DESC'
  );
}

export async function getKilnFiring(id: number): Promise<KilnFiring | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<KilnFiring & { custom_items: string | null }>(
    `SELECT kf.*, k.name as kiln_name
     FROM kiln_firings kf
     LEFT JOIN kilns k ON k.id = kf.kiln_id
     WHERE kf.id = ?`,
    [id]
  );
  if (!row) return null;
  const firing: KilnFiring = {
    ...row,
    custom_items: row.custom_items ? JSON.parse(row.custom_items) : [],
  };
  firing.items = await getKilnFiringItems(id);
  return firing;
}

export async function getKilnFiringItems(firingId: number): Promise<KilnFiringItem[]> {
  const db = await getDatabase();
  return db.getAllAsync<KilnFiringItem>(
    `SELECT kfi.*, p.name as product_name, cr.name as color_recipe_name,
            lcb.name as liquid_clay_batch_name
     FROM kiln_firing_items kfi
     JOIN production_items pi ON pi.id = kfi.production_item_id
     JOIN products p ON p.id = pi.product_id
     LEFT JOIN color_recipes cr ON cr.id = pi.color_recipe_id
     LEFT JOIN liquid_clay_batches lcb ON lcb.id = pi.liquid_clay_batch_id
     WHERE kfi.kiln_firing_id = ?`,
    [firingId]
  );
}

export async function addKilnFiring(
  data: Omit<KilnFiring, 'id' | 'created_at' | 'items'>,
  items: Omit<KilnFiringItem, 'id' | 'kiln_firing_id' | 'product_name' | 'color_recipe_name' | 'liquid_clay_batch_name'>[]
): Promise<number> {
  const db = await getDatabase();
  let firingId = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO kiln_firings (date, program_name, temperature, duration_hours, firing_type, status, notes, kiln_id, custom_items)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.date,
        data.program_name ?? null,
        data.temperature,
        data.duration_hours ?? null,
        data.firing_type,
        data.status,
        data.notes ?? null,
        data.kiln_id ?? null,
        data.custom_items?.length ? JSON.stringify(data.custom_items) : null,
      ]
    );
    firingId = result.lastInsertRowId;
    for (const item of items) {
      await db.runAsync(
        `INSERT INTO kiln_firing_items (kiln_firing_id, production_item_id, quantity)
         VALUES (?, ?, ?)`,
        [firingId, item.production_item_id, item.quantity]
      );
    }
  });
  return firingId;
}

export async function updateKilnFiring(
  id: number,
  data: Omit<KilnFiring, 'id' | 'created_at' | 'items'>,
  items: Omit<KilnFiringItem, 'id' | 'kiln_firing_id' | 'product_name' | 'color_recipe_name' | 'liquid_clay_batch_name'>[]
): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE kiln_firings
       SET date = ?, program_name = ?, temperature = ?, duration_hours = ?,
           firing_type = ?, notes = ?, kiln_id = ?, custom_items = ?
       WHERE id = ?`,
      [
        data.date,
        data.program_name ?? null,
        data.temperature,
        data.duration_hours ?? null,
        data.firing_type,
        data.notes ?? null,
        data.kiln_id ?? null,
        data.custom_items?.length ? JSON.stringify(data.custom_items) : null,
        id,
      ]
    );
    await db.runAsync('DELETE FROM kiln_firing_items WHERE kiln_firing_id = ?', [id]);
    for (const item of items) {
      await db.runAsync(
        `INSERT INTO kiln_firing_items (kiln_firing_id, production_item_id, quantity)
         VALUES (?, ?, ?)`,
        [id, item.production_item_id, item.quantity]
      );
    }
  });
}

export async function updateKilnFiringStatus(id: number, status: KilnStatus): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE kiln_firings SET status = ? WHERE id = ?', [status, id]);

  if (status === 'done') {
    const firing = await db.getFirstAsync<{ firing_type: FiringType }>(
      'SELECT firing_type FROM kiln_firings WHERE id = ?', [id]
    );
    if (!firing) return;

    const { from, to } = FIRING_STAGE_MAP[firing.firing_type];

    // Bu pişirime bağlı ve doğru aşamadaki üretim kalemlerini ilerlet
    const items = await db.getAllAsync<{ production_item_id: number }>(
      `SELECT kfi.production_item_id
       FROM kiln_firing_items kfi
       JOIN production_items pi ON pi.id = kfi.production_item_id
       WHERE kfi.kiln_firing_id = ? AND pi.current_stage = ?`,
      [id, from]
    );

    for (const item of items) {
      await updateProductionItemStage(item.production_item_id, to);
    }
  }
}

/**
 * Pişirimin toplam elektrik maliyetini ve her üretim kalemi için
 * satış fiyatı orantılı maliyet payını hesaplar.
 */
export async function calculateFiringCost(firingId: number): Promise<FiringCostDetail> {
  const db = await getDatabase();
  const none: FiringCostDetail = {
    total_electricity_cost: 0, electricity_price_per_kwh: 0,
    item_costs: {}, missing_electricity_price: false, missing_kiln_or_duration: false,
  };

  const firing = await db.getFirstAsync<{
    date: string; duration_hours: number | null;
    power_kw: number | null; custom_items: string | null;
  }>(
    `SELECT kf.date, kf.duration_hours, k.power_kw, kf.custom_items
     FROM kiln_firings kf
     LEFT JOIN kilns k ON k.id = kf.kiln_id
     WHERE kf.id = ?`,
    [firingId]
  );
  if (!firing) return none;

  if (!firing.duration_hours || !firing.power_kw) {
    return { ...none, missing_kiln_or_duration: true };
  }

  const electricityPricePerKwh = await getElectricityPriceForDate(firing.date);
  if (electricityPricePerKwh <= 0) {
    return { ...none, missing_electricity_price: true };
  }

  const totalElecCost = firing.power_kw * firing.duration_hours * electricityPricePerKwh;

  // Üretim kalemleri + satış fiyatları
  const prodItems = await db.getAllAsync<{
    production_item_id: number; quantity: number; selling_price: number;
  }>(
    `SELECT kfi.production_item_id, kfi.quantity, p.selling_price
     FROM kiln_firing_items kfi
     JOIN production_items pi ON pi.id = kfi.production_item_id
     JOIN products p          ON p.id  = pi.product_id
     WHERE kfi.kiln_firing_id = ?`,
    [firingId]
  );

  // Toplam fırın değeri (üretim + özel ürünler)
  let totalValue = prodItems.reduce((s, i) => s + i.selling_price * i.quantity, 0);
  if (firing.custom_items) {
    try {
      const customs: Array<{ product_id: number; quantity: number }> = JSON.parse(firing.custom_items);
      for (const c of customs) {
        const p = await db.getFirstAsync<{ selling_price: number }>(
          'SELECT selling_price FROM products WHERE id = ?', [c.product_id]
        );
        if (p) totalValue += p.selling_price * c.quantity;
      }
    } catch {}
  }

  if (totalValue <= 0) {
    return { ...none, total_electricity_cost: totalElecCost, electricity_price_per_kwh: electricityPricePerKwh };
  }

  // Her kalem için pay hesapla
  const item_costs: FiringCostDetail['item_costs'] = {};
  for (const item of prodItems) {
    const share     = (item.selling_price * item.quantity) / totalValue;
    const allocated = totalElecCost * share;
    item_costs[item.production_item_id] = {
      total_cost:    allocated,
      per_unit_cost: allocated / item.quantity,
    };
  }

  return {
    total_electricity_cost: totalElecCost,
    electricity_price_per_kwh: electricityPricePerKwh,
    item_costs,
    missing_electricity_price: false,
    missing_kiln_or_duration: false,
  };
}

export async function deleteKilnFiring(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM kiln_firings WHERE id = ?', [id]);
}

export async function getUpcomingFirings(): Promise<KilnFiring[]> {
  const db = await getDatabase();
  return db.getAllAsync<KilnFiring>(
    `SELECT * FROM kiln_firings WHERE status IN ('planned','firing') ORDER BY date ASC`
  );
}
