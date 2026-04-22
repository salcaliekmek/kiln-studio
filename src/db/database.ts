import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('onni_studio.db');
    await initializeSchema(db);
  }
  return db;
}

/**
 * Sadece üretim verilerini siler: partiler, fırınlar, stok, planlar, sıvı çamur.
 * Hammadde, ürün, renk reçetesi, ayarlar ve fırın ekipmanları KORUNUR.
 * Hammadde stok miktarları yalnızca satın almalardan yeniden hesaplanır.
 */
export async function resetProductionData(): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await database.execAsync(`DELETE FROM kiln_firing_items;`);
    await database.execAsync(`DELETE FROM kiln_firings;`);
    await database.execAsync(`DELETE FROM stock;`);
    await database.execAsync(`DELETE FROM production_plans;`);
    await database.execAsync(`DELETE FROM production_items;`);
    await database.execAsync(`DELETE FROM production_batches;`);
    await database.execAsync(`DELETE FROM liquid_clay_batches;`);
    // Hammadde stok miktarlarını sadece satın almalar üzerinden yeniden hesapla
    await database.execAsync(`
      UPDATE materials
      SET stock_quantity = COALESCE(
        (SELECT SUM(p.quantity) FROM purchases p WHERE p.material_id = materials.id),
        0
      )
    `);
  });
}

/**
 * Tüm üretim/stok/hammadde verilerini siler, şema ve uygulama ayarları korunur.
 */
export async function resetAllData(): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    // Bağımlı tablolar önce (CASCADE olmayan referanslar için)
    await database.execAsync(`DELETE FROM kiln_firing_items;`);
    await database.execAsync(`DELETE FROM kiln_firings;`);
    await database.execAsync(`DELETE FROM stock;`);
    await database.execAsync(`DELETE FROM production_items;`);
    await database.execAsync(`DELETE FROM production_batches;`);
    await database.execAsync(`DELETE FROM liquid_clay_batches;`);
    await database.execAsync(`DELETE FROM purchases;`);
    await database.execAsync(`DELETE FROM color_recipe_components;`);
    await database.execAsync(`DELETE FROM color_recipes;`);
    await database.execAsync(`DELETE FROM product_recipe_items;`);
    await database.execAsync(`DELETE FROM product_weights;`);
    await database.execAsync(`DELETE FROM products;`);
    await database.execAsync(`DELETE FROM materials;`);
    await database.execAsync(`DELETE FROM kilns;`);
    await database.execAsync(`DELETE FROM electricity_prices;`);
    // settings (stüdyo adı, sahibi, aktif aşamalar) kasıtlı olarak korunuyor
  });
}

async function initializeSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`PRAGMA journal_mode = WAL;`);
  await db.execAsync(`PRAGMA foreign_keys = ON;`);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('clay','pigment','glaze','decal','other')),
      unit TEXT NOT NULL CHECK(unit IN ('gr','kg','lt','ml','adet')),
      stock_quantity REAL NOT NULL DEFAULT 0,
      cost_per_unit REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
      quantity REAL NOT NULL,
      total_cost REAL NOT NULL,
      purchase_date TEXT NOT NULL,
      supplier TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      collection TEXT NOT NULL DEFAULT 'Diğer',
      size TEXT NOT NULL DEFAULT 'Standart',
      selling_price REAL NOT NULL DEFAULT 0,
      firing_count INTEGER NOT NULL DEFAULT 3 CHECK(firing_count IN (2,3)),
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS product_recipe_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
      quantity REAL NOT NULL,
      stage TEXT NOT NULL CHECK(stage IN ('casting','glaze','decal'))
    );

    CREATE TABLE IF NOT EXISTS color_recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      base_clay_quantity REAL NOT NULL DEFAULT 1000,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS color_recipe_components (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      color_recipe_id INTEGER NOT NULL REFERENCES color_recipes(id) ON DELETE CASCADE,
      material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
      quantity REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS production_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_started TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS production_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      color_recipe_id INTEGER REFERENCES color_recipes(id),
      quantity INTEGER NOT NULL DEFAULT 1,
      current_stage TEXT NOT NULL DEFAULT 'casting'
    );

    CREATE TABLE IF NOT EXISTS kiln_firings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      program_name TEXT,
      temperature INTEGER NOT NULL,
      duration_hours REAL,
      firing_type TEXT NOT NULL CHECK(firing_type IN ('bisque','glaze','decal')),
      status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','firing','done')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS kiln_firing_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kiln_firing_id INTEGER NOT NULL REFERENCES kiln_firings(id) ON DELETE CASCADE,
      production_item_id INTEGER NOT NULL REFERENCES production_items(id),
      quantity INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 0,
      stage TEXT NOT NULL CHECK(stage IN ('bisque','semi','finished')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE(product_id, stage)
    );
  `);

  // Sıvı çamur tablosu
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS liquid_clay_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      clay_material_id INTEGER NOT NULL REFERENCES materials(id),
      clay_quantity REAL NOT NULL,
      water_quantity REAL NOT NULL DEFAULT 0,
      color_recipe_id INTEGER REFERENCES color_recipes(id),
      total_weight REAL NOT NULL,
      available_quantity REAL NOT NULL,
      total_cost REAL NOT NULL DEFAULT 0,
      cost_per_kg REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);

  // Ayarlar ve fırın ekipmanları tabloları
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kilns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      power_kw REAL NOT NULL DEFAULT 0
    );
  `);

  // Migrations
  try {
    await db.execAsync(`ALTER TABLE products ADD COLUMN size TEXT NOT NULL DEFAULT 'Standart';`);
  } catch (_) {}

  // Üretim partisine sıvı çamur bağlantısı
  try {
    await db.execAsync(`ALTER TABLE production_items ADD COLUMN liquid_clay_batch_id INTEGER REFERENCES liquid_clay_batches(id);`);
  } catch (_) {}
  try {
    await db.execAsync(`ALTER TABLE production_items ADD COLUMN clay_used_quantity REAL;`);
  } catch (_) {}
  // Ürüne döküm ağırlığı
  try {
    await db.execAsync(`ALTER TABLE products ADD COLUMN casting_weight_gr REAL;`);
  } catch (_) {}
  // Fırın pişirimine kiln_id bağlantısı
  try {
    await db.execAsync(`ALTER TABLE kiln_firings ADD COLUMN kiln_id INTEGER REFERENCES kilns(id);`);
  } catch (_) {}
  // Fırın pişirimine katalogdan eklenen özel ürünler (JSON)
  try {
    await db.execAsync(`ALTER TABLE kiln_firings ADD COLUMN custom_items TEXT;`);
  } catch (_) {}
  // Aylık elektrik birim fiyatı geçmişi
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS electricity_prices (
      year          INTEGER NOT NULL,
      month         INTEGER NOT NULL,
      price_per_kwh REAL    NOT NULL,
      PRIMARY KEY (year, month)
    );
  `);

  // Üretim kalemine sır malzemesi bağlantısı
  try {
    await db.execAsync(`ALTER TABLE production_items ADD COLUMN glaze_material_id INTEGER REFERENCES materials(id);`);
  } catch (_) {}
  // Üretim anındaki sır birim maliyeti snapshot (fiyat değişse eski üretimler etkilenmesin)
  try {
    await db.execAsync(`ALTER TABLE production_items ADD COLUMN glaze_cost_per_unit REAL;`);
  } catch (_) {}

  // Migration: stok aşamalarını güncelle — 'glazed' → 'semi' (Yarı Mamül)
  try {
    const tableInfo = await db.getFirstAsync<{ sql: string }>(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='stock'`
    );
    if (tableInfo && tableInfo.sql.includes("'glazed'")) {
      await db.execAsync(`ALTER TABLE stock RENAME TO stock_old`);
      await db.execAsync(`
        CREATE TABLE stock (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          quantity   INTEGER NOT NULL DEFAULT 0,
          stage      TEXT    NOT NULL CHECK(stage IN ('bisque','semi','finished')),
          updated_at TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
          UNIQUE(product_id, stage)
        )
      `);
      await db.execAsync(`
        INSERT OR IGNORE INTO stock (product_id, quantity, stage, updated_at)
        SELECT product_id, quantity,
          CASE stage WHEN 'glazed' THEN 'semi' ELSE stage END,
          updated_at
        FROM stock_old
        WHERE stage IN ('bisque','glazed','finished')
      `);
      await db.execAsync(`DROP TABLE stock_old`);
    }
  } catch (_) {}

  // Üretim planlama takvimi
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS production_plans (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      production_item_id   INTEGER NOT NULL REFERENCES production_items(id) ON DELETE CASCADE,
      planned_date         TEXT    NOT NULL,
      stage                TEXT    NOT NULL,
      quantity             INTEGER NOT NULL,
      notes                TEXT,
      created_at           TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);

  // Migration: stock tablosuna liquid_clay_batch_id ekle — UNIQUE constraint değişiyor
  try {
    const stockSql = await db.getFirstAsync<{ sql: string }>(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='stock'`
    );
    if (stockSql && !stockSql.sql.includes('liquid_clay_batch_id')) {
      await db.execAsync(`ALTER TABLE stock RENAME TO stock_old_v3`);
      await db.execAsync(`
        CREATE TABLE stock (
          id                   INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id           INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          liquid_clay_batch_id INTEGER NOT NULL DEFAULT 0,
          quantity             INTEGER NOT NULL DEFAULT 0,
          stage                TEXT    NOT NULL CHECK(stage IN ('bisque','semi','finished')),
          updated_at           TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
          UNIQUE(product_id, stage, liquid_clay_batch_id)
        )
      `);
      await db.execAsync(`
        INSERT OR IGNORE INTO stock (product_id, liquid_clay_batch_id, quantity, stage, updated_at)
        SELECT product_id, 0, quantity, stage, updated_at FROM stock_old_v3
      `);
      await db.execAsync(`DROP TABLE stock_old_v3`);
    }
  } catch (_) {}

  // Migration: production_plans tablosuna completed_at ekle
  try {
    await db.execAsync(`ALTER TABLE production_plans ADD COLUMN completed_at TEXT;`);
  } catch (_) {}

  // Ürün ağırlık profili tablosu
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS product_weights (
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      stage      TEXT    NOT NULL,
      weight_gr  REAL    NOT NULL,
      updated_at TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      PRIMARY KEY (product_id, stage)
    );
  `);
}
