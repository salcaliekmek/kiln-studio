import { getDatabase } from '../db/database';
import { StockEntry, StockStage } from '../types';

export async function getStock(): Promise<StockEntry[]> {
  const db = await getDatabase();
  return db.getAllAsync<StockEntry>(
    `SELECT s.*, p.name as product_name, p.collection
     FROM stock s
     JOIN products p ON p.id = s.product_id
     WHERE s.quantity > 0
     ORDER BY p.collection, p.name, s.stage`
  );
}

export async function getStockByStage(stage: StockStage): Promise<StockEntry[]> {
  const db = await getDatabase();
  return db.getAllAsync<StockEntry>(
    `SELECT s.*, p.name as product_name, p.collection
     FROM stock s
     JOIN products p ON p.id = s.product_id
     WHERE s.stage = ? AND s.quantity > 0
     ORDER BY p.collection, p.name`,
    [stage]
  );
}

export async function getStockByProduct(productId: number): Promise<StockEntry[]> {
  const db = await getDatabase();
  return db.getAllAsync<StockEntry>(
    `SELECT s.*, p.name as product_name, p.collection
     FROM stock s
     JOIN products p ON p.id = s.product_id
     WHERE s.product_id = ?
     ORDER BY s.stage`,
    [productId]
  );
}

export async function adjustStock(productId: number, stage: StockStage, delta: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO stock (product_id, quantity, stage, updated_at)
     VALUES (?, MAX(0, ?), ?, datetime('now','localtime'))
     ON CONFLICT(product_id, stage) DO UPDATE SET
       quantity   = MAX(0, quantity + ?),
       updated_at = datetime('now','localtime')`,
    [productId, delta, stage, delta]
  );
}

export async function setStock(productId: number, stage: StockStage, quantity: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO stock (product_id, quantity, stage, updated_at)
     VALUES (?, ?, ?, datetime('now','localtime'))
     ON CONFLICT(product_id, stage) DO UPDATE SET
       quantity = excluded.quantity,
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
