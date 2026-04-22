import { getDatabase } from '../db/database';
import { StockEntry, StockStage } from '../types';

const BASE_SELECT = `
  SELECT s.*, p.name as product_name, p.collection,
         lcb.name as liquid_clay_batch_name
  FROM stock s
  JOIN products p ON p.id = s.product_id
  LEFT JOIN liquid_clay_batches lcb ON lcb.id = s.liquid_clay_batch_id
`;

export async function getStock(): Promise<StockEntry[]> {
  const db = await getDatabase();
  return db.getAllAsync<StockEntry>(
    `${BASE_SELECT}
     WHERE s.quantity > 0
     ORDER BY p.collection, p.name, lcb.name, s.stage`
  );
}

export async function getStockByStage(stage: StockStage): Promise<StockEntry[]> {
  const db = await getDatabase();
  return db.getAllAsync<StockEntry>(
    `${BASE_SELECT}
     WHERE s.stage = ? AND s.quantity > 0
     ORDER BY p.collection, p.name, lcb.name`,
    [stage]
  );
}

export async function getStockByProduct(productId: number): Promise<StockEntry[]> {
  const db = await getDatabase();
  return db.getAllAsync<StockEntry>(
    `${BASE_SELECT}
     WHERE s.product_id = ?
     ORDER BY lcb.name, s.stage`,
    [productId]
  );
}

/** Manuel düzeltme — stok kaydı id'si üzerinden */
export async function adjustStock(stockId: number, delta: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE stock SET
       quantity   = MAX(0, quantity + ?),
       updated_at = datetime('now','localtime')
     WHERE id = ?`,
    [delta, stockId]
  );
}

/** Manuel stok girişi (renksiz / 0 batch ile) */
export async function setStock(productId: number, stage: StockStage, quantity: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO stock (product_id, liquid_clay_batch_id, quantity, stage, updated_at)
     VALUES (?, 0, ?, ?, datetime('now','localtime'))
     ON CONFLICT(product_id, stage, liquid_clay_batch_id) DO UPDATE SET
       quantity   = excluded.quantity,
       updated_at = datetime('now','localtime')`,
    [productId, quantity, stage]
  );
}

export async function getTotalFinishedStock(): Promise<number> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ total: number }>(
    `SELECT SUM(quantity) as total FROM stock WHERE stage = 'finished'`
  );
  return result?.total ?? 0;
}

export async function getStockValue(): Promise<number> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ total: number }>(
    `SELECT SUM(s.quantity * p.selling_price) as total
     FROM stock s
     JOIN products p ON p.id = s.product_id
     WHERE s.stage = 'finished'`
  );
  return result?.total ?? 0;
}
