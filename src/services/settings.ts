import { getDatabase } from '../db/database';
import { ElectricityPrice, ProductionStage } from '../types';

export interface AppProfile {
  owner_name: string;
  studio_name: string;
  active_collections: string[];
  active_stages: ProductionStage[];
}

const ALL_STAGES: ProductionStage[] = [
  'casting','drying','bisque','bisque_done',
  'glazing','glaze_firing','glaze_done',
  'decal','decal_firing','sanding','finished',
];

export const PROFILE_DEFAULTS: AppProfile = {
  owner_name: '',
  studio_name: 'Onni Studio',
  active_collections: ['Rigel', 'Origo', 'Onnimug', 'Vega', 'Diğer'],
  active_stages: [...ALL_STAGES],
};

export async function getProfile(): Promise<AppProfile> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return {
    owner_name: map.owner_name ?? PROFILE_DEFAULTS.owner_name,
    studio_name: map.studio_name ?? PROFILE_DEFAULTS.studio_name,
    active_collections: map.active_collections ? JSON.parse(map.active_collections) : PROFILE_DEFAULTS.active_collections,
    active_stages: map.active_stages ? JSON.parse(map.active_stages) : PROFILE_DEFAULTS.active_stages,
  };
}

// ─── Elektrik Fiyatı Geçmişi ─────────────────────────────────────────────────

/** Tüm aylık elektrik fiyatlarını en yeniden eskiye sıralar. */
export async function getElectricityPrices(): Promise<ElectricityPrice[]> {
  const db = await getDatabase();
  return db.getAllAsync<ElectricityPrice>(
    'SELECT year, month, price_per_kwh FROM electricity_prices ORDER BY year DESC, month DESC'
  );
}

/** Belirli bir ay için fiyatı kaydet (varsa güncelle). */
export async function setElectricityPrice(year: number, month: number, price: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO electricity_prices (year, month, price_per_kwh) VALUES (?, ?, ?)',
    [year, month, price]
  );
}

/** Bir kayıt sil. */
export async function deleteElectricityPrice(year: number, month: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'DELETE FROM electricity_prices WHERE year = ? AND month = ?',
    [year, month]
  );
}

/**
 * Verilen tarih için geçerli elektrik birim fiyatını döner.
 * Önce tam ay eşleşmesi aranır; bulunamazsa o tarihten önceki
 * en son girilen fiyat kullanılır. Hiç kayıt yoksa 0 döner.
 */
export async function getElectricityPriceForDate(date: string): Promise<number> {
  const db = await getDatabase();
  const [yearStr, monthStr] = date.split('-');
  const year  = parseInt(yearStr);
  const month = parseInt(monthStr);

  // Exact match
  const exact = await db.getFirstAsync<{ price_per_kwh: number }>(
    'SELECT price_per_kwh FROM electricity_prices WHERE year = ? AND month = ?',
    [year, month]
  );
  if (exact) return exact.price_per_kwh;

  // En yakın önceki kayıt
  const prev = await db.getFirstAsync<{ price_per_kwh: number }>(
    `SELECT price_per_kwh FROM electricity_prices
     WHERE (year < ?) OR (year = ? AND month < ?)
     ORDER BY year DESC, month DESC LIMIT 1`,
    [year, year, month]
  );
  return prev?.price_per_kwh ?? 0;
}

export async function saveProfile(profile: Partial<AppProfile>): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (const [key, value] of Object.entries(profile)) {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, serialized]);
    }
  });
}
