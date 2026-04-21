import { getDatabase } from '../db/database';
import { ProductionBatch, ProductionItem, ProductionStage } from '../types';
import { useLiquidClay } from './liquidClay';
import { getElectricityPriceForDate } from './settings';

export async function getProductionBatches(): Promise<ProductionBatch[]> {
  const db = await getDatabase();
  // Adet ağırlıklı ilerleme: her aşamaya 0-10 arası indeks atanır, 10 = finished
  return db.getAllAsync<ProductionBatch>(`
    SELECT pb.*,
      ROUND(
        COALESCE(
          SUM(pi.quantity * CASE pi.current_stage
            WHEN 'casting'       THEN 0
            WHEN 'drying'        THEN 1
            WHEN 'bisque'        THEN 2
            WHEN 'bisque_done'   THEN 3
            WHEN 'glazing'       THEN 4
            WHEN 'glaze_firing'  THEN 5
            WHEN 'glaze_done'    THEN 6
            WHEN 'decal'         THEN 7
            WHEN 'decal_firing'  THEN 8
            WHEN 'sanding'       THEN 9
            WHEN 'finished'      THEN 10
            ELSE 0 END
          ) * 100.0 / (NULLIF(SUM(pi.quantity), 0) * 10.0),
          0
        )
      ) as progress_pct
    FROM production_batches pb
    LEFT JOIN production_items pi ON pi.batch_id = pb.id
    GROUP BY pb.id
    ORDER BY
      CASE WHEN progress_pct >= 100 THEN 1 ELSE 0 END ASC,  -- tamamlananlar en sona
      pb.date_started ASC,                                    -- eski tarihler önce
      progress_pct ASC                                        -- düşük ilerleme önce
  `);
}

export async function getProductionBatch(id: number): Promise<ProductionBatch | null> {
  const db = await getDatabase();
  const batch = await db.getFirstAsync<ProductionBatch>(
    'SELECT * FROM production_batches WHERE id = ?', [id]
  );
  if (!batch) return null;
  batch.items = await getProductionItems(id);
  return batch;
}

export async function getProductionItems(batchId: number): Promise<ProductionItem[]> {
  const db = await getDatabase();
  return db.getAllAsync<ProductionItem>(
    `SELECT pi.*, p.name as product_name, cr.name as color_recipe_name,
            lcb.name as liquid_clay_batch_name,
            gm.name as glaze_material_name
     FROM production_items pi
     JOIN products p ON p.id = pi.product_id
     LEFT JOIN color_recipes cr ON cr.id = pi.color_recipe_id
     LEFT JOIN liquid_clay_batches lcb ON lcb.id = pi.liquid_clay_batch_id
     LEFT JOIN materials gm ON gm.id = pi.glaze_material_id
     WHERE pi.batch_id = ?`,
    [batchId]
  );
}

export async function addProductionBatch(
  data: Omit<ProductionBatch, 'id' | 'created_at' | 'items'>,
  items: Omit<ProductionItem, 'id' | 'batch_id' | 'product_name' | 'color_recipe_name' | 'liquid_clay_batch_name' | 'glaze_material_name' | 'current_stage'>[]
): Promise<number> {
  const db = await getDatabase();
  let batchId = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO production_batches (date_started, notes) VALUES (?, ?)`,
      [data.date_started, data.notes ?? null]
    );
    batchId = result.lastInsertRowId;
    for (const item of items) {
      // Döküm ağırlığını ağırlık profilinden al; yoksa eski products.casting_weight_gr'a bak
      let castingWeightGr: number | null = null;
      const pw = await db.getFirstAsync<{ weight_gr: number }>(
        `SELECT weight_gr FROM product_weights WHERE product_id = ? AND stage = 'casting'`,
        [item.product_id]
      );
      if (pw?.weight_gr && pw.weight_gr > 0) {
        castingWeightGr = pw.weight_gr;
      } else {
        // Geriye dönük uyum: eski products.casting_weight_gr
        const productRow = await db.getFirstAsync<{ casting_weight_gr: number | null }>(
          'SELECT casting_weight_gr FROM products WHERE id = ?', [item.product_id]
        );
        if (productRow?.casting_weight_gr && productRow.casting_weight_gr > 0) {
          castingWeightGr = productRow.casting_weight_gr;
        }
      }

      // clay_used_quantity: döküm ağırlığı × adet (bilinmiyorsa null)
      const clay_used_quantity = castingWeightGr != null
        ? castingWeightGr * item.quantity
        : (item.clay_used_quantity ?? null);

      // Üretim anındaki sır birim maliyetini snapshot olarak al
      let glazeCostPerUnit: number | null = null;
      if (item.glaze_material_id) {
        const glazeMat = await db.getFirstAsync<{ cost_per_unit: number }>(
          'SELECT cost_per_unit FROM materials WHERE id = ?', [item.glaze_material_id]
        );
        glazeCostPerUnit = glazeMat?.cost_per_unit ?? null;
      }

      await db.runAsync(
        `INSERT INTO production_items
           (batch_id, product_id, color_recipe_id, liquid_clay_batch_id, clay_used_quantity, glaze_material_id, glaze_cost_per_unit, quantity, current_stage)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'casting')`,
        [
          batchId,
          item.product_id,
          item.color_recipe_id ?? null,
          item.liquid_clay_batch_id ?? null,
          clay_used_quantity,
          item.glaze_material_id ?? null,
          glazeCostPerUnit,
          item.quantity,
        ]
      );
      // Sıvı çamur stokunu otomatik düş
      if (item.liquid_clay_batch_id && clay_used_quantity) {
        await useLiquidClay(item.liquid_clay_batch_id, clay_used_quantity);
      }
    }
  });
  return batchId;
}

export async function updateProductionItemStage(itemId: number, stage: ProductionStage): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE production_items SET current_stage = ? WHERE id = ?',
    [stage, itemId]
  );

  // Eğer finished ise stoka ekle
  if (stage === 'finished') {
    const item = await db.getFirstAsync<ProductionItem>(
      'SELECT * FROM production_items WHERE id = ?', [itemId]
    );
    if (item) {
      await db.runAsync(
        `INSERT INTO stock (product_id, quantity, stage)
         VALUES (?, ?, 'finished')
         ON CONFLICT(product_id, stage) DO UPDATE SET
           quantity = quantity + excluded.quantity,
           updated_at = datetime('now','localtime')`,
        [item.product_id, item.quantity]
      );
    }
  }

  // bisque_done → bisküvi stoka ekle
  if (stage === 'bisque_done') {
    const item = await db.getFirstAsync<ProductionItem>(
      'SELECT * FROM production_items WHERE id = ?', [itemId]
    );
    if (item) {
      await db.runAsync(
        `INSERT INTO stock (product_id, quantity, stage)
         VALUES (?, ?, 'bisque')
         ON CONFLICT(product_id, stage) DO UPDATE SET
           quantity = quantity + excluded.quantity,
           updated_at = datetime('now','localtime')`,
        [item.product_id, item.quantity]
      );
    }
  }

  // glaze_done → bisküvi stoktan düş, yarı mamül stoka ekle
  if (stage === 'glaze_done') {
    const item = await db.getFirstAsync<ProductionItem>(
      'SELECT * FROM production_items WHERE id = ?', [itemId]
    );
    if (item) {
      // Bisküvi stokunu azalt (sıfırın altına düşürme)
      await db.runAsync(
        `UPDATE stock SET
           quantity   = MAX(0, quantity - ?),
           updated_at = datetime('now','localtime')
         WHERE product_id = ? AND stage = 'bisque'`,
        [item.quantity, item.product_id]
      );
      // Yarı mamül stoka ekle
      await db.runAsync(
        `INSERT INTO stock (product_id, quantity, stage)
         VALUES (?, ?, 'semi')
         ON CONFLICT(product_id, stage) DO UPDATE SET
           quantity   = quantity + excluded.quantity,
           updated_at = datetime('now','localtime')`,
        [item.product_id, item.quantity]
      );
    }
  }
}

export async function getActiveProductionItems(): Promise<ProductionItem[]> {
  const db = await getDatabase();
  return db.getAllAsync<ProductionItem>(
    `SELECT pi.*, p.name as product_name, cr.name as color_recipe_name,
            lcb.name as liquid_clay_batch_name,
            gm.name as glaze_material_name
     FROM production_items pi
     JOIN products p ON p.id = pi.product_id
     LEFT JOIN color_recipes cr ON cr.id = pi.color_recipe_id
     LEFT JOIN liquid_clay_batches lcb ON lcb.id = pi.liquid_clay_batch_id
     LEFT JOIN materials gm ON gm.id = pi.glaze_material_id
     WHERE pi.current_stage != 'finished'
     ORDER BY pi.id DESC`
  );
}

export async function updateProductionBatch(
  id: number,
  data: { date_started?: string; notes?: string }
): Promise<void> {
  const db = await getDatabase();
  const fields = Object.entries(data)
    .map(([k]) => `${k} = ?`)
    .join(', ');
  const values = [...Object.values(data), id];
  await db.runAsync(`UPDATE production_batches SET ${fields} WHERE id = ?`, values);
}

export async function deleteProductionBatch(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM production_batches WHERE id = ?', [id]);
}

// ─── Production item cost lines ───────────────────────────────────────────────

export interface ProductionCostLine {
  key: string;
  label: string;
  amount: number;
  detail?: string;
}

const STAGE_ORDER: ProductionStage[] = [
  'casting', 'drying', 'bisque', 'bisque_done',
  'glazing', 'glaze_firing', 'glaze_done',
  'decal', 'decal_firing', 'sanding', 'finished',
];

/**
 * Finds the "done" kiln firing of the given type that contains this item,
 * and returns the electricity cost allocated to this item (value-based share).
 */
async function getItemFiringCost(
  db: Awaited<ReturnType<typeof getDatabase>>,
  itemId: number,
  productId: number,
  quantity: number,
  firingType: string
): Promise<number | null> {
  const firing = await db.getFirstAsync<{
    id: number; date: string; duration_hours: number | null;
    power_kw: number | null; custom_items: string | null;
  }>(
    `SELECT kf.id, kf.date, kf.duration_hours, k.power_kw, kf.custom_items
     FROM kiln_firings kf
     JOIN kiln_firing_items kfi ON kfi.kiln_firing_id = kf.id
     LEFT JOIN kilns k ON k.id = kf.kiln_id
     WHERE kfi.production_item_id = ? AND kf.firing_type = ? AND kf.status = 'done'
     LIMIT 1`,
    [itemId, firingType]
  );
  if (!firing || !firing.duration_hours || !firing.power_kw) return null;

  const elecPrice = await getElectricityPriceForDate(firing.date);
  if (elecPrice <= 0) return null;

  const totalElec = firing.power_kw * firing.duration_hours * elecPrice;

  // Value-based share: get all items in this firing
  const allItems = await db.getAllAsync<{
    production_item_id: number; quantity: number; selling_price: number;
  }>(
    `SELECT kfi.production_item_id, kfi.quantity, p.selling_price
     FROM kiln_firing_items kfi
     JOIN production_items pi ON pi.id = kfi.production_item_id
     JOIN products p ON p.id = pi.product_id
     WHERE kfi.kiln_firing_id = ?`,
    [firing.id]
  );

  let totalValue = allItems.reduce((s, i) => s + i.selling_price * i.quantity, 0);
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
  if (totalValue <= 0) return null;

  const prod = await db.getFirstAsync<{ selling_price: number }>(
    'SELECT selling_price FROM products WHERE id = ?', [productId]
  );
  if (!prod || prod.selling_price <= 0) return null;

  const share = (prod.selling_price * quantity) / totalValue;
  return totalElec * share;
}

/**
 * Returns accumulated cost lines for a production item based on its current stage.
 * New lines appear as each process stage is completed.
 */
export async function getProductionItemCostLines(itemId: number): Promise<ProductionCostLine[]> {
  const db = await getDatabase();

  const item = await db.getFirstAsync<{
    current_stage: ProductionStage;
    quantity: number;
    product_id: number;
    clay_used_quantity: number | null;
    glaze_material_id: number | null;
    glaze_cost_per_unit: number | null;
    liquid_clay_batch_id: number | null;
  }>('SELECT * FROM production_items WHERE id = ?', [itemId]);

  if (!item) return [];

  const stageIdx = STAGE_ORDER.indexOf(item.current_stage);
  const lines: ProductionCostLine[] = [];

  // 1. Clay cost — casting done when stage >= drying (idx >= 1)
  if (stageIdx >= 1 && item.liquid_clay_batch_id) {
    // clay_used_quantity null ise ağırlık profilinden (casting) fallback hesapla
    let clayUsedGr = item.clay_used_quantity ?? null;
    let isEstimateClay = false;
    if (!clayUsedGr || clayUsedGr <= 0) {
      const pw = await db.getFirstAsync<{ weight_gr: number }>(
        `SELECT weight_gr FROM product_weights WHERE product_id = ? AND stage = 'casting'`,
        [item.product_id]
      );
      if (pw?.weight_gr && pw.weight_gr > 0) {
        clayUsedGr = pw.weight_gr * item.quantity;
        isEstimateClay = true;
      } else {
        // Geriye dönük uyum
        const prod = await db.getFirstAsync<{ casting_weight_gr: number | null }>(
          'SELECT casting_weight_gr FROM products WHERE id = ?', [item.product_id]
        );
        if (prod?.casting_weight_gr && prod.casting_weight_gr > 0) {
          clayUsedGr = prod.casting_weight_gr * item.quantity;
          isEstimateClay = true;
        }
      }
    }
    if (clayUsedGr && clayUsedGr > 0) {
      const lcb = await db.getFirstAsync<{ cost_per_kg: number }>(
        'SELECT cost_per_kg FROM liquid_clay_batches WHERE id = ?',
        [item.liquid_clay_batch_id]
      );
      if (lcb && lcb.cost_per_kg > 0) {
        const kg = clayUsedGr / 1000;
        const amount = kg * lcb.cost_per_kg;
        lines.push({
          key: 'clay',
          label: isEstimateClay ? 'Döküm *' : 'Döküm',
          amount,
          detail: `${kg.toFixed(3)}kg × ₺${lcb.cost_per_kg.toFixed(2)}/kg${isEstimateClay ? ' (güncel ağırlık)' : ''}`,
        });
      }
    }
  }

  // 2. Bisque firing electricity — stage >= bisque_done (idx >= 3)
  if (stageIdx >= 3) {
    const cost = await getItemFiringCost(db, itemId, item.product_id, item.quantity, 'bisque');
    if (cost !== null) {
      lines.push({
        key: 'bisque_elec',
        label: 'Bisküvi Pişirimi',
        amount: cost,
        detail: `${item.quantity} adet × ₺${(cost / item.quantity).toFixed(2)}`,
      });
    }
  }

  // 3. Glaze material — stage >= glaze_firing (idx >= 5)
  // Hesap: sır tutma gramajı (ağırlık profili) × sır malzeme birim fiyatı
  if (stageIdx >= 5) {
    // Sır malzeme fiyatı kaynağı (öncelik sırası):
    // 1. production_item snapshot (glaze_cost_per_unit)
    // 2. production_item.glaze_material_id → güncel fiyat
    // 3. ürün reçetesindeki sır malzemesi → güncel fiyat
    let glazeCostPerUnit: number | null = item.glaze_cost_per_unit ?? null;
    let matUnit = 'kg';
    let isEstimate = false;

    if (!glazeCostPerUnit || glazeCostPerUnit <= 0) {
      // Doğrudan bağlı sır malzemesi
      const matId = item.glaze_material_id;
      const matRow = matId
        ? await db.getFirstAsync<{ cost_per_unit: number; unit: string }>(
            'SELECT cost_per_unit, unit FROM materials WHERE id = ?', [matId]
          )
        : null;

      if (matRow && matRow.cost_per_unit > 0) {
        glazeCostPerUnit = matRow.cost_per_unit;
        matUnit = matRow.unit;
        isEstimate = true;
      } else {
        // Fallback: ürün reçetesindeki sır aşaması malzemesi
        const recipeMat = await db.getFirstAsync<{ cost_per_unit: number; unit: string }>(
          `SELECT m.cost_per_unit, m.unit
           FROM product_recipe_items pri
           JOIN materials m ON m.id = pri.material_id
           WHERE pri.product_id = ? AND pri.stage = 'glaze'
           ORDER BY m.cost_per_unit DESC LIMIT 1`,
          [item.product_id]
        );
        if (recipeMat && recipeMat.cost_per_unit > 0) {
          glazeCostPerUnit = recipeMat.cost_per_unit;
          matUnit = recipeMat.unit;
          isEstimate = true;
        }
      }
    }

    // Sır tutma gramajı — ağırlık profilinden (post_glaze - pre_glaze)
    const weights = await db.getAllAsync<{ stage: string; weight_gr: number }>(
      'SELECT stage, weight_gr FROM product_weights WHERE product_id = ?', [item.product_id]
    );
    const wMap: Record<string, number> = {};
    weights.forEach(w => { wMap[w.stage] = w.weight_gr; });
    const glazeUptakeGr = (wMap.pre_glaze != null && wMap.post_glaze != null && wMap.post_glaze > wMap.pre_glaze)
      ? wMap.post_glaze - wMap.pre_glaze
      : null;

    if (glazeCostPerUnit && glazeCostPerUnit > 0 && glazeUptakeGr && glazeUptakeGr > 0) {
      const costPerGr = matUnit === 'kg' ? glazeCostPerUnit / 1000 : glazeCostPerUnit;
      const perUnit = glazeUptakeGr * costPerGr;
      const amount = perUnit * item.quantity;
      lines.push({
        key: 'glaze',
        label: isEstimate ? 'Sırlama *' : 'Sırlama',
        amount,
        detail: `${item.quantity} adet × ₺${perUnit.toFixed(2)} (${glazeUptakeGr}gr)${isEstimate ? ' (güncel fiyat)' : ''}`,
      });
    }
  }

  // 4. Glaze firing electricity — stage >= glaze_done (idx >= 6)
  if (stageIdx >= 6) {
    const cost = await getItemFiringCost(db, itemId, item.product_id, item.quantity, 'glaze');
    if (cost !== null) {
      lines.push({
        key: 'glaze_elec',
        label: 'Sır Pişirimi',
        amount: cost,
        detail: `${item.quantity} adet × ₺${(cost / item.quantity).toFixed(2)}`,
      });
    }
  }

  // 5. Decal firing electricity — stage >= sanding (idx >= 9)
  if (stageIdx >= 9) {
    const cost = await getItemFiringCost(db, itemId, item.product_id, item.quantity, 'decal');
    if (cost !== null) {
      lines.push({
        key: 'decal_elec',
        label: 'Dekal Pişirimi',
        amount: cost,
        detail: `${item.quantity} adet × ₺${(cost / item.quantity).toFixed(2)}`,
      });
    }
  }

  return lines;
}
