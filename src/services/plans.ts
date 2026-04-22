import { getDatabase } from '../db/database';
import { ProductionStage } from '../types';

export interface ProductionPlan {
  id: number;
  production_item_id: number;
  planned_date: string;
  stage: ProductionStage;
  quantity: number;
  notes?: string;
  completed_at?: string | null;
  // Joined
  product_name: string;
  batch_date: string;
  current_stage: ProductionStage;
  total_quantity: number;
  liquid_clay_name?: string | null;
  color_recipe_name?: string | null;
  glaze_material_name?: string | null;
}

export async function getPlansForDate(date: string): Promise<ProductionPlan[]> {
  const db = await getDatabase();
  return db.getAllAsync<ProductionPlan>(
    `SELECT pp.*, p.name as product_name, pb.date_started as batch_date,
            pi.current_stage, pi.quantity as total_quantity,
            lcb.name as liquid_clay_name,
            cr.name  as color_recipe_name,
            gm.name  as glaze_material_name
     FROM production_plans pp
     JOIN production_items pi ON pi.id = pp.production_item_id
     JOIN products p          ON p.id  = pi.product_id
     JOIN production_batches pb ON pb.id = pi.batch_id
     LEFT JOIN liquid_clay_batches lcb ON lcb.id = pi.liquid_clay_batch_id
     LEFT JOIN color_recipes cr        ON cr.id  = pi.color_recipe_id
     LEFT JOIN materials gm            ON gm.id  = pi.glaze_material_id
     WHERE pp.planned_date = ?
     ORDER BY pp.created_at`,
    [date]
  );
}

export type DayPlanStatus = 'all_done' | 'partial' | 'none';

export interface DayPlanInfo {
  total: number;
  completed: number;
  pending_count: number; // tamamlanmamış plan kaydı sayısı
  status: DayPlanStatus;
}

/** Aydaki her gün için plan özeti (toplam / tamamlanan adet) */
export async function getPlannedDatesForMonth(
  year: number,
  month: number
): Promise<Record<string, DayPlanInfo>> {
  const db = await getDatabase();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const rows = await db.getAllAsync<{
    planned_date: string; total: number; completed: number; pending_count: number;
  }>(
    `SELECT planned_date,
            SUM(quantity) as total,
            SUM(CASE WHEN completed_at IS NOT NULL THEN quantity ELSE 0 END) as completed,
            SUM(CASE WHEN completed_at IS NULL THEN 1 ELSE 0 END) as pending_count
     FROM production_plans
     WHERE planned_date LIKE ?
     GROUP BY planned_date`,
    [`${prefix}%`]
  );
  const result: Record<string, DayPlanInfo> = {};
  rows.forEach(r => {
    result[r.planned_date] = {
      total: r.total,
      completed: r.completed,
      pending_count: r.pending_count,
      status: r.completed >= r.total ? 'all_done' : 'partial',
    };
  });
  return result;
}

export async function addProductionPlan(data: {
  production_item_id: number;
  planned_date: string;
  stage: ProductionStage;
  quantity: number;
  notes?: string;
}): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO production_plans (production_item_id, planned_date, stage, quantity, notes)
     VALUES (?, ?, ?, ?, ?)`,
    [data.production_item_id, data.planned_date, data.stage, data.quantity, data.notes ?? null]
  );
  return result.lastInsertRowId;
}

export async function deleteProductionPlan(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM production_plans WHERE id = ?', [id]);
}

/** Planı tamamlandı olarak işaretle */
export async function markPlanCompleted(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE production_plans SET completed_at = datetime('now','localtime') WHERE id = ?`,
    [id]
  );
}

/** Planın tamamlandı işaretini geri al */
export async function unmarkPlanCompleted(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE production_plans SET completed_at = NULL WHERE id = ?`,
    [id]
  );
}

/** Bir kalem için belirli aşamadaki tamamlanan toplam adet.
 *  Stage filtresi olmadan sayarsa önceki aşamaların planları da dahil olur ve
 *  yanlış erken aşama geçişine neden olur. */
export async function getCompletedQuantityForItem(
  productionItemId: number,
  stage: ProductionStage,
): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(quantity), 0) as total
     FROM production_plans
     WHERE production_item_id = ? AND stage = ? AND completed_at IS NOT NULL`,
    [productionItemId, stage]
  );
  return row?.total ?? 0;
}

/** Bir kalem için toplam planlanmış adet.
 *  stage verilirse sadece o aşamadaki planlar sayılır (mevcut aşama kontrolü için). */
export async function getPlannedQuantityForItem(
  productionItemId: number,
  stage?: ProductionStage
): Promise<number> {
  const db = await getDatabase();
  if (stage) {
    const row = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(quantity), 0) as total
       FROM production_plans WHERE production_item_id = ? AND stage = ?`,
      [productionItemId, stage]
    );
    return row?.total ?? 0;
  }
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(quantity), 0) as total
     FROM production_plans WHERE production_item_id = ?`,
    [productionItemId]
  );
  return row?.total ?? 0;
}
