import { getDatabase } from '../db/database';
import { Material, MaterialConsumption, MaterialUnit, Purchase } from '../types';

export async function getMaterials(type?: string): Promise<Material[]> {
  const db = await getDatabase();
  if (type) {
    return db.getAllAsync<Material>(
      'SELECT * FROM materials WHERE type = ? ORDER BY name',
      [type]
    );
  }
  return db.getAllAsync<Material>('SELECT * FROM materials ORDER BY type, name');
}

export async function getMaterial(id: number): Promise<Material | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Material>('SELECT * FROM materials WHERE id = ?', [id]);
}

export async function addMaterial(data: Omit<Material, 'id' | 'created_at'>): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO materials (name, type, unit, stock_quantity, cost_per_unit, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.name, data.type, data.unit, data.stock_quantity, data.cost_per_unit, data.notes ?? null]
  );
  return result.lastInsertRowId;
}

export async function updateMaterial(id: number, data: Partial<Omit<Material, 'id' | 'created_at'>>): Promise<void> {
  const db = await getDatabase();
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(data), id];
  await db.runAsync(`UPDATE materials SET ${fields} WHERE id = ?`, values);
}

export async function deleteMaterial(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM materials WHERE id = ?', [id]);
}

export async function getPurchases(materialId?: number): Promise<Purchase[]> {
  const db = await getDatabase();
  if (materialId) {
    return db.getAllAsync<Purchase>(
      `SELECT p.*, m.name as material_name FROM purchases p
       JOIN materials m ON m.id = p.material_id
       WHERE p.material_id = ? ORDER BY p.purchase_date DESC`,
      [materialId]
    );
  }
  return db.getAllAsync<Purchase>(
    `SELECT p.*, m.name as material_name FROM purchases p
     JOIN materials m ON m.id = p.material_id
     ORDER BY p.purchase_date DESC`
  );
}

export async function addPurchase(data: Omit<Purchase, 'id' | 'material_name'>): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO purchases (material_id, quantity, total_cost, purchase_date, supplier, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.material_id, data.quantity, data.total_cost, data.purchase_date, data.supplier ?? null, data.notes ?? null]
    );
    // Mevcut stok ve birim maliyeti oku
    const mat = await db.getFirstAsync<{ stock_quantity: number; cost_per_unit: number }>(
      'SELECT stock_quantity, cost_per_unit FROM materials WHERE id = ?',
      [data.material_id]
    );
    const prevStock = mat?.stock_quantity ?? 0;
    const prevCost  = mat?.cost_per_unit ?? 0;
    // Ağırlıklı ortalama maliyet: (mevcut stok değeri + yeni alım tutarı) / toplam miktar
    const newCostPerUnit = (prevStock * prevCost + data.total_cost) / (prevStock + data.quantity);
    // Stok ve birim maliyeti güncelle
    await db.runAsync(
      'UPDATE materials SET stock_quantity = stock_quantity + ?, cost_per_unit = ? WHERE id = ?',
      [data.quantity, newCostPerUnit, data.material_id]
    );
  });
}

/**
 * Hammadde tüketim geçmişi:
 * - Çamur: sıvı çamur üretiminde kullanılan miktarlar (clay_material_id)
 * - Pigment: renk reçetesi üzerinden sıvı çamur üretiminde kullanılan miktarlar
 * - Sır: üretim partilerinde glaze_material_id ile bağlı kullanımlar
 */
export async function getMaterialConsumptions(
  materialId: number,
  unit: MaterialUnit
): Promise<MaterialConsumption[]> {
  const db = await getDatabase();
  const results: MaterialConsumption[] = [];

  // 1. Çamur tüketimi — sıvı çamur üretimi
  const clayRows = await db.getAllAsync<{ id: number; date: string; source: string; qty: number }>(
    `SELECT lcb.id, DATE(lcb.created_at) as date, lcb.name as source,
            lcb.clay_quantity as qty
     FROM liquid_clay_batches lcb
     WHERE lcb.clay_material_id = ?
     ORDER BY lcb.created_at DESC`,
    [materialId]
  );
  clayRows.forEach(r => results.push({
    id: `clay_${r.id}`,
    date: r.date,
    source: r.source,
    quantity: unit === 'kg' ? r.qty / 1000 : r.qty,
    unit,
    source_type: 'liquid_clay',
  }));

  // 2. Pigment tüketimi — renk reçetesi ile sıvı çamur üretimi
  // Formül: (lcb.clay_quantity / cr.base_clay_quantity) * crc.quantity
  const pigmentRows = await db.getAllAsync<{ id: number; date: string; source: string; qty: number }>(
    `SELECT lcb.id, DATE(lcb.created_at) as date, lcb.name as source,
            ROUND(crc.quantity * lcb.clay_quantity / cr.base_clay_quantity, 2) as qty
     FROM liquid_clay_batches lcb
     JOIN color_recipe_components crc ON crc.color_recipe_id = lcb.color_recipe_id
     JOIN color_recipes cr ON cr.id = lcb.color_recipe_id
     WHERE crc.material_id = ?
     ORDER BY lcb.created_at DESC`,
    [materialId]
  );
  pigmentRows.forEach(r => results.push({
    id: `pigment_${r.id}`,
    date: r.date,
    source: r.source,
    quantity: unit === 'kg' ? r.qty / 1000 : r.qty,
    unit,
    source_type: 'liquid_clay',
  }));

  // 3. Sır tüketimi — üretim partileri
  // Gramaj: ağırlık profilindeki sır tutma (post_glaze - pre_glaze) × adet
  const glazeRows = await db.getAllAsync<{
    id: number; date: string; source: string; piece_qty: number;
    pre_glaze_gr: number | null; post_glaze_gr: number | null;
  }>(
    `SELECT pi.id, pb.date_started as date, p.name as source,
            pi.quantity as piece_qty,
            pw_pre.weight_gr  as pre_glaze_gr,
            pw_post.weight_gr as post_glaze_gr
     FROM production_items pi
     JOIN products p ON p.id = pi.product_id
     JOIN production_batches pb ON pb.id = pi.batch_id
     LEFT JOIN product_weights pw_pre  ON pw_pre.product_id  = pi.product_id AND pw_pre.stage  = 'pre_glaze'
     LEFT JOIN product_weights pw_post ON pw_post.product_id = pi.product_id AND pw_post.stage = 'post_glaze'
     WHERE pi.glaze_material_id = ?
     ORDER BY pb.date_started DESC`,
    [materialId]
  );
  glazeRows.forEach(r => {
    const uptakeGr = (r.pre_glaze_gr != null && r.post_glaze_gr != null && r.post_glaze_gr > r.pre_glaze_gr)
      ? r.post_glaze_gr - r.pre_glaze_gr
      : null;
    const qty = uptakeGr != null ? uptakeGr * r.piece_qty : r.piece_qty;
    const displayUnit = uptakeGr != null ? (unit === 'kg' ? 'kg' : 'gr') : 'adet';
    results.push({
      id: `glaze_${r.id}`,
      date: r.date,
      source: r.source,
      quantity: uptakeGr != null && unit === 'kg' ? qty / 1000 : qty,
      unit: displayUnit,
      source_type: 'production',
    });
  });

  // Tarihe göre azalan sırala
  results.sort((a, b) => b.date.localeCompare(a.date));
  return results;
}

export async function getMaterialsWithLowStock(): Promise<Material[]> {
  const db = await getDatabase();
  return db.getAllAsync<Material>(
    'SELECT * FROM materials WHERE stock_quantity < 100 ORDER BY stock_quantity ASC'
  );
}
