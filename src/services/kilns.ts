import { getDatabase } from '../db/database';
import { Kiln } from '../types';

export async function getKilns(): Promise<Kiln[]> {
  const db = await getDatabase();
  return db.getAllAsync<Kiln>('SELECT * FROM kilns ORDER BY name');
}

export async function addKiln(data: Omit<Kiln, 'id'>): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    'INSERT INTO kilns (name, power_kw) VALUES (?, ?)',
    [data.name, data.power_kw]
  );
  return result.lastInsertRowId;
}

export async function deleteKiln(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM kilns WHERE id = ?', [id]);
}
