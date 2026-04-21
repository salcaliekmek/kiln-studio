import { getDatabase } from '../db/database';
import { Product, ProductRecipeItem } from '../types';
import { getElectricityPriceForDate } from './settings';

export async function getProducts(collection?: string): Promise<Product[]> {
  const db = await getDatabase();
  if (collection) {
    return db.getAllAsync<Product>(
      'SELECT * FROM products WHERE collection = ? ORDER BY name',
      [collection]
    );
  }
  return db.getAllAsync<Product>('SELECT * FROM products ORDER BY collection, name');
}

export async function getProduct(id: number): Promise<Product | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Product>('SELECT * FROM products WHERE id = ?', [id]);
}

export async function addProduct(
  data: Omit<Product, 'id' | 'created_at'>,
  recipe: Omit<ProductRecipeItem, 'id' | 'product_id' | 'material_name' | 'material_unit'>[]
): Promise<number> {
  const db = await getDatabase();
  let productId = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO products (name, collection, size, selling_price, firing_count, casting_weight_gr, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.collection, data.size, data.selling_price, data.firing_count, data.casting_weight_gr ?? null, data.description ?? null]
    );
    productId = result.lastInsertRowId;
    for (const item of recipe) {
      await db.runAsync(
        `INSERT INTO product_recipe_items (product_id, material_id, quantity, stage)
         VALUES (?, ?, ?, ?)`,
        [productId, item.material_id, item.quantity, item.stage]
      );
    }
  });
  return productId;
}

export async function updateProduct(id: number, data: Partial<Omit<Product, 'id' | 'created_at'>>): Promise<void> {
  const db = await getDatabase();
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(data), id];
  await db.runAsync(`UPDATE products SET ${fields} WHERE id = ?`, values);
}

export async function deleteProduct(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM products WHERE id = ?', [id]);
}

export async function getProductRecipe(productId: number): Promise<ProductRecipeItem[]> {
  const db = await getDatabase();
  return db.getAllAsync<ProductRecipeItem>(
    `SELECT pri.*, m.name as material_name, m.unit as material_unit
     FROM product_recipe_items pri
     JOIN materials m ON m.id = pri.material_id
     WHERE pri.product_id = ?
     ORDER BY pri.stage, m.name`,
    [productId]
  );
}

export async function updateProductRecipe(
  productId: number,
  recipe: Omit<ProductRecipeItem, 'id' | 'product_id' | 'material_name' | 'material_unit'>[]
): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM product_recipe_items WHERE product_id = ?', [productId]);
    for (const item of recipe) {
      await db.runAsync(
        `INSERT INTO product_recipe_items (product_id, material_id, quantity, stage)
         VALUES (?, ?, ?, ?)`,
        [productId, item.material_id, item.quantity, item.stage]
      );
    }
  });
}

export async function calculateProductCost(productId: number): Promise<{
  recipe_cost: number;
  clay_cost: number;
  total: number;
  casting_weight_gr?: number;
  avg_cost_per_kg?: number;
}> {
  const db = await getDatabase();

  // Hammadde reçetesi maliyeti
  const recipeResult = await db.getFirstAsync<{ total: number }>(
    `SELECT SUM(pri.quantity * m.cost_per_unit) as total
     FROM product_recipe_items pri
     JOIN materials m ON m.id = pri.material_id
     WHERE pri.product_id = ?`,
    [productId]
  );
  const recipe_cost = recipeResult?.total ?? 0;

  // Döküm ağırlığı — önce ağırlık profilinden (casting), sonra eski products.casting_weight_gr
  const pw = await db.getFirstAsync<{ weight_gr: number }>(
    `SELECT weight_gr FROM product_weights WHERE product_id = ? AND stage = 'casting'`,
    [productId]
  );
  let casting_weight_gr: number | undefined = pw?.weight_gr && pw.weight_gr > 0 ? pw.weight_gr : undefined;
  if (!casting_weight_gr) {
    const product = await db.getFirstAsync<{ casting_weight_gr: number | null }>(
      'SELECT casting_weight_gr FROM products WHERE id = ?', [productId]
    );
    if (product?.casting_weight_gr && product.casting_weight_gr > 0) {
      casting_weight_gr = product.casting_weight_gr;
    }
  }

  let clay_cost = 0;
  let avg_cost_per_kg: number | undefined;

  if (casting_weight_gr && casting_weight_gr > 0) {
    const clayResult = await db.getFirstAsync<{ avg_cpkg: number | null }>(
      'SELECT AVG(cost_per_kg) as avg_cpkg FROM liquid_clay_batches WHERE cost_per_kg > 0'
    );
    avg_cost_per_kg = clayResult?.avg_cpkg ?? undefined;
    if (avg_cost_per_kg) {
      clay_cost = (casting_weight_gr / 1000) * avg_cost_per_kg;
    }
  }

  return { recipe_cost, clay_cost, total: recipe_cost + clay_cost, casting_weight_gr, avg_cost_per_kg };
}

export interface StockCostDetail {
  clay_cost: number;            // döküm çamuru maliyeti
  glaze_cost: number;           // sır maliyeti (uptake bazlı)
  other_cost: number;           // diğer reçete kalemleri
  bisque_cost: number;          // bisküvi pişirim elektrik payı
  glaze_firing_cost: number;    // sır pişirim elektrik payı
  decal_cost: number;           // dekal pişirim elektrik payı
  total: number;                // birim toplam maliyet (hammadde + pişirim)
  selling_price: number;
  profit_per_unit: number;
  profit_margin_pct: number;
  casting_weight_gr?: number;
  glaze_uptake_gr?: number;
  avg_clay_cost_per_kg?: number;
  // Eksik veri uyarıları
  missing_clay_batch: boolean;
  missing_electricity_price: boolean; // kWh fiyatı girilmemiş
}

/**
 * Bir ürünün pişirim elektrik maliyetini hesaplar.
 * Dağıtım yöntemi: satış fiyatı bazlı (değer orantılı).
 * Birden fazla pişirim varsa adete göre ağırlıklı ortalama alınır.
 */
async function calcFiringCosts(
  db: Awaited<ReturnType<typeof getDatabase>>,
  productId: number,
  sellingPrice: number
): Promise<{ bisque: number; glaze: number; decal: number; missing_electricity_price: boolean }> {
  const result = { bisque: 0, glaze: 0, decal: 0, missing_electricity_price: false };

  // Bu ürünün yer aldığı tamamlanmış pişirimler
  const firings = await db.getAllAsync<{
    id: number;
    firing_type: string;
    date: string;
    duration_hours: number | null;
    power_kw: number;
    custom_items: string | null;
    item_qty: number;
  }>(
    `SELECT kf.id, kf.firing_type, kf.date, kf.duration_hours, k.power_kw,
            kf.custom_items, SUM(kfi.quantity) AS item_qty
     FROM kiln_firing_items kfi
     JOIN kiln_firings kf ON kf.id = kfi.kiln_firing_id
     JOIN kilns k          ON k.id  = kf.kiln_id
     JOIN production_items pi ON pi.id = kfi.production_item_id
     WHERE pi.product_id = ?
       AND kf.status = 'done'
       AND kf.kiln_id IS NOT NULL
     GROUP BY kf.id`,
    [productId]
  );

  // Tip başına: toplam ağırlıklı maliyet + toplam adet
  const acc: Record<string, { wCost: number; qty: number }> = {
    bisque: { wCost: 0, qty: 0 },
    glaze:  { wCost: 0, qty: 0 },
    decal:  { wCost: 0, qty: 0 },
  };

  for (const f of firings) {
    if (!f.duration_hours || f.duration_hours <= 0) continue;

    // Pişirimin yapıldığı ay/yılın elektrik birim fiyatını çek
    const electricityPricePerKwh = await getElectricityPriceForDate(f.date);
    if (electricityPricePerKwh <= 0) {
      result.missing_electricity_price = true;
      continue;
    }

    const elecCost = f.power_kw * f.duration_hours * electricityPricePerKwh;

    // Fırındaki tüm production item'larının satış değeri
    const prodItems = await db.getAllAsync<{ selling_price: number; quantity: number }>(
      `SELECT p.selling_price, kfi.quantity
       FROM kiln_firing_items kfi
       JOIN production_items pi ON pi.id = kfi.production_item_id
       JOIN products p          ON p.id  = pi.product_id
       WHERE kfi.kiln_firing_id = ?`,
      [f.id]
    );

    let totalValue = prodItems.reduce((s, i) => s + i.selling_price * i.quantity, 0);

    // Katalogdan eklenen özel ürünler (JSON)
    if (f.custom_items) {
      try {
        const customs: Array<{ product_id: number; quantity: number }> = JSON.parse(f.custom_items);
        for (const c of customs) {
          const p = await db.getFirstAsync<{ selling_price: number }>(
            'SELECT selling_price FROM products WHERE id = ?', [c.product_id]
          );
          if (p) totalValue += p.selling_price * c.quantity;
        }
      } catch {}
    }

    if (totalValue <= 0) continue;

    // Bu ürünün payı: (satış fiyatı × adet) / toplam fırın değeri
    const share = (sellingPrice * f.item_qty) / totalValue;
    const costPerUnit = (elecCost * share) / f.item_qty;

    const t = f.firing_type as 'bisque' | 'glaze' | 'decal';
    if (acc[t]) {
      acc[t].wCost += costPerUnit * f.item_qty;
      acc[t].qty   += f.item_qty;
    }
  }

  if (acc.bisque.qty > 0) result.bisque = acc.bisque.wCost / acc.bisque.qty;
  if (acc.glaze.qty  > 0) result.glaze  = acc.glaze.wCost  / acc.glaze.qty;
  if (acc.decal.qty  > 0) result.decal  = acc.decal.wCost  / acc.decal.qty;

  return result;
}


export async function calculateStockItemCost(productId: number): Promise<StockCostDetail | null> {
  const db = await getDatabase();

  const product = await db.getFirstAsync<{ casting_weight_gr: number | null; selling_price: number }>(
    'SELECT casting_weight_gr, selling_price FROM products WHERE id = ?', [productId]
  );
  if (!product) return null;

  // ── Ağırlık profili ────────────────────────────────────────────────────────
  const weights = await db.getAllAsync<{ stage: string; weight_gr: number }>(
    'SELECT stage, weight_gr FROM product_weights WHERE product_id = ?', [productId]
  );
  const wMap: Record<string, number> = {};
  weights.forEach(w => { wMap[w.stage] = w.weight_gr; });

  // Ağırlık profili öncelikli; yoksa eski products.casting_weight_gr (geriye dönük uyum)
  const casting_weight_gr: number | undefined =
    (wMap.casting != null && wMap.casting > 0)
      ? wMap.casting
      : (product.casting_weight_gr && product.casting_weight_gr > 0 ? product.casting_weight_gr : undefined);

  const glaze_uptake_gr: number | undefined =
    (wMap.post_glaze != null && wMap.pre_glaze != null)
      ? wMap.post_glaze - wMap.pre_glaze
      : undefined;

  // ── Reçete — sır dışı diğer malzemeler (güncel fiyat) ────────────────────
  const recipeItems = await db.getAllAsync<{ stage: string; quantity: number; cost_per_unit: number }>(
    `SELECT pri.stage, pri.quantity, m.cost_per_unit
     FROM product_recipe_items pri
     JOIN materials m ON m.id = pri.material_id
     WHERE pri.product_id = ?`,
    [productId]
  );
  const otherItems  = recipeItems.filter(r => r.stage !== 'glaze');
  const glazeItems  = recipeItems.filter(r => r.stage === 'glaze');
  const other_cost  = otherItems.reduce((s, r) => s + r.quantity * r.cost_per_unit, 0);
  const recipe_glaze_nominal_qty  = glazeItems.reduce((s, r) => s + r.quantity, 0);
  const recipe_glaze_nominal_cost = glazeItems.reduce((s, r) => s + r.quantity * r.cost_per_unit, 0);

  // ── Tüm tamamlanmış üretim kalemleri — ağırlıklı ortalama için ────────────
  // Stokta bulunmayan (satılmış) ürünler için de hesaplama yapılır;
  // bu, birim maliyetin tarihi ağırlıklı ortalamasını temsil eder.
  const finishedItems = await db.getAllAsync<{
    quantity: number;
    clay_cost_per_kg: number | null;
    glaze_cost_per_unit: number | null;
    glaze_mat_cost_per_unit: number | null;
    glaze_unit: string | null;
  }>(
    `SELECT pi.quantity,
            lcb.cost_per_kg          AS clay_cost_per_kg,
            pi.glaze_cost_per_unit,
            m.cost_per_unit          AS glaze_mat_cost_per_unit,
            m.unit                   AS glaze_unit
     FROM production_items pi
     LEFT JOIN liquid_clay_batches lcb ON lcb.id = pi.liquid_clay_batch_id
     LEFT JOIN materials m             ON m.id   = pi.glaze_material_id
     WHERE pi.product_id = ? AND pi.current_stage = 'finished'`,
    [productId]
  );

  // Hiç tamamlanmış kalem yoksa en son üretim kalemini referans al (önizleme)
  const referenceItems = finishedItems.length > 0
    ? finishedItems
    : await db.getAllAsync<{
        quantity: number;
        clay_cost_per_kg: number | null;
        glaze_cost_per_unit: number | null;
        glaze_mat_cost_per_unit: number | null;
        glaze_unit: string | null;
      }>(
        `SELECT pi.quantity,
                lcb.cost_per_kg          AS clay_cost_per_kg,
                pi.glaze_cost_per_unit,
                m.cost_per_unit          AS glaze_mat_cost_per_unit,
                m.unit                   AS glaze_unit
         FROM production_items pi
         LEFT JOIN liquid_clay_batches lcb ON lcb.id = pi.liquid_clay_batch_id
         LEFT JOIN materials m             ON m.id   = pi.glaze_material_id
         WHERE pi.product_id = ?
         ORDER BY pi.id DESC LIMIT 1`,
        [productId]
      );

  // ── Ağırlıklı ortalama hesabı ─────────────────────────────────────────────
  let totalWeightedClay  = 0;
  let totalWeightedGlaze = 0;
  let totalQuantity      = 0;
  let weightedCpkg       = 0;   // avg_clay_cost_per_kg için
  let totalCpkgWeight    = 0;
  let missing_clay_batch = false;

  for (const item of referenceItems) {
    const qty = item.quantity;

    // Çamur maliyeti (birim başına) — batch'in sabit cost_per_kg'ı
    let item_clay = 0;
    if (casting_weight_gr && casting_weight_gr > 0) {
      if (item.clay_cost_per_kg && item.clay_cost_per_kg > 0) {
        item_clay = (casting_weight_gr / 1000) * item.clay_cost_per_kg;
        weightedCpkg    += item.clay_cost_per_kg * qty;
        totalCpkgWeight += qty;
      } else {
        missing_clay_batch = true;
      }
    }

    // Sır maliyeti (birim başına) — snapshot öncelikli, yoksa güncel malzeme fiyatı
    let item_glaze = 0;
    const effectiveGlazeCost = (item.glaze_cost_per_unit != null && item.glaze_cost_per_unit > 0)
      ? item.glaze_cost_per_unit
      : (item.glaze_mat_cost_per_unit ?? null);
    if (effectiveGlazeCost != null && effectiveGlazeCost > 0 && glaze_uptake_gr != null && glaze_uptake_gr > 0) {
      const costPerGr = item.glaze_unit === 'kg'
        ? effectiveGlazeCost / 1000
        : effectiveGlazeCost;
      item_glaze = glaze_uptake_gr * costPerGr;
    } else if (recipe_glaze_nominal_qty > 0) {
      item_glaze = glaze_uptake_gr != null && glaze_uptake_gr > 0
        ? recipe_glaze_nominal_cost * (glaze_uptake_gr / recipe_glaze_nominal_qty)
        : recipe_glaze_nominal_cost;
    }

    totalWeightedClay  += qty * item_clay;
    totalWeightedGlaze += qty * item_glaze;
    totalQuantity      += qty;
  }

  const clay_cost  = totalQuantity > 0 ? totalWeightedClay  / totalQuantity : 0;
  const glaze_cost = totalQuantity > 0 ? totalWeightedGlaze / totalQuantity : 0;
  const avg_clay_cost_per_kg = totalCpkgWeight > 0 ? weightedCpkg / totalCpkgWeight : undefined;

  // ── Pişirim elektrik maliyeti (değer orantılı, tarih bazlı fiyat) ─────────
  const firingCosts = await calcFiringCosts(db, productId, product.selling_price);

  const total = clay_cost + glaze_cost + other_cost
    + firingCosts.bisque + firingCosts.glaze + firingCosts.decal;
  const profit_per_unit    = product.selling_price - total;
  const profit_margin_pct  = product.selling_price > 0
    ? (profit_per_unit / product.selling_price) * 100 : 0;

  return {
    clay_cost, glaze_cost, other_cost,
    bisque_cost: firingCosts.bisque,
    glaze_firing_cost: firingCosts.glaze,
    decal_cost: firingCosts.decal,
    total,
    selling_price: product.selling_price,
    profit_per_unit, profit_margin_pct,
    casting_weight_gr, glaze_uptake_gr, avg_clay_cost_per_kg,
    missing_clay_batch,
    missing_electricity_price: firingCosts.missing_electricity_price,
  };
}
