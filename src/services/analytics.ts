import { getDatabase } from '../db/database';

export type AnalyticsPeriod = 'month' | 'year' | 'all';

function sinceDate(period: AnalyticsPeriod): string {
  const now = new Date();
  if (period === 'month') {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }
  if (period === 'year') {
    return `${now.getFullYear()}-01-01`;
  }
  return '2000-01-01';
}

// ─── Türkçe ay kısaltmaları ───────────────────────────────────────────────
const MONTH_NAMES = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  const currentYear = new Date().getFullYear().toString();
  const suffix = y !== currentYear ? ` '${y.slice(2)}` : '';
  return MONTH_NAMES[parseInt(m) - 1] + suffix;
}

// ─── Interfaces ───────────────────────────────────────────────────────────

export interface AnalyticsSummary {
  total_purchase_cost: number;
  stock_value: number;
  total_produced_qty: number;    // tüm zamanlar finished adet
  active_production_qty: number; // şu an aktif (finished hariç)
  liquid_clay_batch_count: number;
  liquid_clay_available_kg: number;
}

export interface MonthlySpending {
  month: string;
  label: string;
  total: number;
}

export interface SpendingByType {
  type: string;
  label: string;
  total: number;
  color: string;
}

export interface TopMaterial {
  name: string;
  type: string;
  total_cost: number;
}

export interface StageDistribution {
  stage: string;
  label: string;
  count: number;
  color: string;
}

export interface StockByCollection {
  collection: string;
  quantity: number;
  value: number;
}

export interface StockByStageRow {
  stage: string;
  label: string;
  quantity: number;
  color: string;
}

// ─── Renk & etiket eşlemeleri ─────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; color: string }> = {
  clay:    { label: 'Kil',     color: '#C4A882' },
  pigment: { label: 'Pigment', color: '#A47BC4' },
  glaze:   { label: 'Sır',     color: '#7BC4A4' },
  decal:   { label: 'Dekal',   color: '#947BC4' },
  other:   { label: 'Diğer',   color: '#ADA39E' },
};

const STAGE_META: Record<string, { label: string; color: string }> = {
  casting:      { label: 'Döküm',          color: '#7B9EC4' },
  drying:       { label: 'Kurutma',         color: '#C4B87B' },
  bisque:       { label: 'Bisküvi',         color: '#C4947B' },
  bisque_done:  { label: 'Bisküvi Bitti',   color: '#C4847B' },
  glazing:      { label: 'Sırlama',         color: '#7BC4A4' },
  glaze_firing: { label: 'Sır Pişirimi',    color: '#7BA4C4' },
  decal:        { label: 'Dekal',           color: '#A47BC4' },
  decal_firing: { label: 'Dekal Pişirimi',  color: '#947BC4' },
  sanding:      { label: 'Zımparalama',     color: '#C4C47B' },
  finished:     { label: 'Satışa Hazır',    color: '#4E8B6B' },
};

const STOCK_STAGE_META: Record<string, { label: string; color: string }> = {
  bisque:   { label: 'Bisküvi',       color: '#C4947B' },
  semi:     { label: 'Yarı Mamül',    color: '#7BC4A4' },
  finished: { label: 'Satışa Hazır',  color: '#4E8B6B' },
};

// ─── Queries ──────────────────────────────────────────────────────────────

export async function getAnalyticsSummary(period: AnalyticsPeriod): Promise<AnalyticsSummary> {
  const db = await getDatabase();
  const since = sinceDate(period);

  const [purchase, stockVal, produced, active, liquidClay] = await Promise.all([
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(total_cost), 0) as total FROM purchases WHERE purchase_date >= ?`,
      [since]
    ),
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(s.quantity * p.selling_price), 0) as total
       FROM stock s JOIN products p ON p.id = s.product_id
       WHERE s.stage = 'finished'`
    ),
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(quantity), 0) as total
       FROM production_items WHERE current_stage = 'finished'`
    ),
    db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(quantity), 0) as total
       FROM production_items WHERE current_stage != 'finished'`
    ),
    db.getFirstAsync<{ cnt: number; available: number }>(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(available_quantity), 0) as available
       FROM liquid_clay_batches`
    ),
  ]);

  return {
    total_purchase_cost:    purchase?.total ?? 0,
    stock_value:            stockVal?.total ?? 0,
    total_produced_qty:     produced?.total ?? 0,
    active_production_qty:  active?.total ?? 0,
    liquid_clay_batch_count: liquidClay?.cnt ?? 0,
    liquid_clay_available_kg: liquidClay?.available ?? 0,
  };
}

/** Son `count` aylık hammadde harcaması (grafik için) */
export async function getMonthlySpending(count: number = 6): Promise<MonthlySpending[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ month: string; total: number }>(
    `SELECT strftime('%Y-%m', purchase_date) as month,
            SUM(total_cost) as total
     FROM purchases
     GROUP BY month
     ORDER BY month DESC
     LIMIT ?`,
    [count]
  );
  return rows
    .reverse()
    .map(r => ({ month: r.month, label: monthLabel(r.month), total: r.total }));
}

/** Malzeme türüne göre toplam harcama */
export async function getSpendingByType(period: AnalyticsPeriod): Promise<SpendingByType[]> {
  const db = await getDatabase();
  const since = sinceDate(period);
  const rows = await db.getAllAsync<{ type: string; total: number }>(
    `SELECT m.type, SUM(p.total_cost) as total
     FROM purchases p
     JOIN materials m ON m.id = p.material_id
     WHERE p.purchase_date >= ?
     GROUP BY m.type
     ORDER BY total DESC`,
    [since]
  );
  return rows.map(r => ({
    type: r.type,
    label: TYPE_META[r.type]?.label ?? r.type,
    total: r.total,
    color: TYPE_META[r.type]?.color ?? '#ADA39E',
  }));
}

/** En çok harcama yapılan 5 hammadde */
export async function getTopMaterials(period: AnalyticsPeriod): Promise<TopMaterial[]> {
  const db = await getDatabase();
  const since = sinceDate(period);
  return db.getAllAsync<TopMaterial>(
    `SELECT m.name, m.type, SUM(p.total_cost) as total_cost
     FROM purchases p
     JOIN materials m ON m.id = p.material_id
     WHERE p.purchase_date >= ?
     GROUP BY m.id
     ORDER BY total_cost DESC
     LIMIT 5`,
    [since]
  );
}

/** Aktif üretim aşama dağılımı */
export async function getStageDistribution(): Promise<StageDistribution[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ stage: string; count: number }>(
    `SELECT current_stage as stage, SUM(quantity) as count
     FROM production_items
     WHERE current_stage != 'finished'
     GROUP BY current_stage
     ORDER BY count DESC`
  );
  return rows.map(r => ({
    stage: r.stage,
    label: STAGE_META[r.stage]?.label ?? r.stage,
    count: r.count,
    color: STAGE_META[r.stage]?.color ?? '#ADA39E',
  }));
}

/** Koleksiyona göre hazır stok */
export async function getStockByCollection(): Promise<StockByCollection[]> {
  const db = await getDatabase();
  return db.getAllAsync<StockByCollection>(
    `SELECT p.collection, SUM(s.quantity) as quantity,
            SUM(s.quantity * p.selling_price) as value
     FROM stock s
     JOIN products p ON p.id = s.product_id
     WHERE s.stage = 'finished' AND s.quantity > 0
     GROUP BY p.collection
     ORDER BY value DESC`
  );
}

/** Aşamaya göre toplam stok (bisküvi/yarı mamül/hazır) */
export async function getStockByStageBreakdown(): Promise<StockByStageRow[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ stage: string; quantity: number }>(
    `SELECT stage, SUM(quantity) as quantity
     FROM stock
     WHERE quantity > 0
     GROUP BY stage`
  );
  return rows.map(r => ({
    stage: r.stage,
    label: STOCK_STAGE_META[r.stage]?.label ?? r.stage,
    quantity: r.quantity,
    color: STOCK_STAGE_META[r.stage]?.color ?? '#ADA39E',
  }));
}
