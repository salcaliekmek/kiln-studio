import { getDatabase } from '../db/database';
import { ProductWeight, ProductWeightStage } from '../types';

export async function getProductWeights(productId: number): Promise<ProductWeight[]> {
  const db = await getDatabase();
  return db.getAllAsync<ProductWeight>(
    'SELECT * FROM product_weights WHERE product_id = ?',
    [productId]
  );
}

export async function saveProductWeights(
  productId: number,
  weights: Partial<Record<ProductWeightStage, number>>
): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (const [stage, weight_gr] of Object.entries(weights)) {
      if (weight_gr === undefined || weight_gr === null) continue;
      await db.runAsync(
        `INSERT INTO product_weights (product_id, stage, weight_gr, updated_at)
         VALUES (?, ?, ?, datetime('now','localtime'))
         ON CONFLICT(product_id, stage) DO UPDATE SET weight_gr = excluded.weight_gr, updated_at = excluded.updated_at`,
        [productId, stage, weight_gr]
      );
    }
  });
}

export async function deleteProductWeight(productId: number, stage: ProductWeightStage): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM product_weights WHERE product_id = ? AND stage = ?', [productId, stage]);
}
