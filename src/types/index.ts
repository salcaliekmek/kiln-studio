// ─── Hammadde ───────────────────────────────────────────────────────────────
export type MaterialType = 'clay' | 'pigment' | 'glaze' | 'decal' | 'other';
export type MaterialUnit = 'gr' | 'kg' | 'lt' | 'ml' | 'adet';

export interface Material {
  id: number;
  name: string;
  type: MaterialType;
  unit: MaterialUnit;
  stock_quantity: number;
  cost_per_unit: number; // birim maliyet (TL)
  notes?: string;
  created_at: string;
}

export interface Purchase {
  id: number;
  material_id: number;
  material_name?: string;
  quantity: number;
  total_cost: number;
  purchase_date: string;
  supplier?: string;
  notes?: string;
}

export interface MaterialConsumption {
  id: string;
  date: string;
  source: string;        // batch adı veya ürün adı
  quantity: number;      // tüketilen miktar (malzeme birimiyle)
  unit: string;          // malzeme birimi veya 'adet'
  source_type: 'liquid_clay' | 'production';
}

// ─── Sıvı Çamur ──────────────────────────────────────────────────────────────
export interface LiquidClayBatch {
  id: number;
  name: string;
  clay_material_id: number;
  clay_material_name?: string;
  clay_quantity: number;        // gram (kuru çamur)
  water_quantity: number;       // gram (su)
  color_recipe_id?: number;
  color_recipe_name?: string;
  total_weight: number;         // gram (clay + water)
  available_quantity: number;   // gram (kalan)
  total_cost: number;           // TL
  cost_per_kg: number;          // TL/kg
  notes?: string;
  created_at: string;
  // Hesaplanmış pigment bileşenleri (görüntüleme için)
  pigment_items?: LiquidClayPigmentItem[];
}

export interface LiquidClayPigmentItem {
  material_id: number;
  material_name: string;
  quantity: number; // gram (ölçeklenmiş)
  cost: number;     // TL
}

// ─── Ürün ────────────────────────────────────────────────────────────────────
export type ProductCollection = string;
export type ProductSize = 'Standart' | 'Mini' | 'Midi' | 'Maxi';
export type FiringStage = 'casting' | 'glaze' | 'decal';

export interface Product {
  id: number;
  name: string;
  collection: ProductCollection;
  size: ProductSize;
  selling_price: number;
  firing_count: 2 | 3;
  casting_weight_gr?: number;  // döküm sonrası tartım ağırlığı (gram)
  description?: string;
  created_at: string;
}

export interface ProductRecipeItem {
  id: number;
  product_id: number;
  material_id: number;
  material_name?: string;
  material_unit?: MaterialUnit;
  quantity: number;
  stage: FiringStage;
}

// ─── Çamur Renk Reçetesi ─────────────────────────────────────────────────────
export interface ColorRecipe {
  id: number;
  name: string;
  description?: string;
  base_clay_quantity: number; // gram
  created_at: string;
  components?: ColorRecipeComponent[];
}

export interface ColorRecipeComponent {
  id: number;
  color_recipe_id: number;
  material_id: number;
  material_name?: string;
  quantity: number; // gram (pigment miktarı)
}

// ─── Üretim ──────────────────────────────────────────────────────────────────
export type ProductionStage =
  | 'casting'       // döküm
  | 'drying'        // kurutma
  | 'bisque'        // bisküvi pişirim bekleniyor
  | 'bisque_done'   // bisküvi bitti, zımparalama
  | 'glazing'       // sırlama
  | 'glaze_firing'  // sır pişirimi bekleniyor
  | 'glaze_done'    // sır bitti
  | 'decal'         // dekal baskı
  | 'decal_firing'  // dekal pişirimi bekleniyor
  | 'sanding'       // son zımparalama
  | 'finished';     // satışa hazır

export interface ProductionBatch {
  id: number;
  date_started: string;
  notes?: string;
  created_at: string;
  items?: ProductionItem[];
  progress_pct?: number;  // SQL'de hesaplanan genel ilerleme (0-100)
}

export interface ProductionItem {
  id: number;
  batch_id: number;
  product_id: number;
  product_name?: string;
  color_recipe_id?: number;
  color_recipe_name?: string;
  liquid_clay_batch_id?: number;
  liquid_clay_batch_name?: string;
  clay_used_quantity?: number;
  glaze_material_id?: number;
  glaze_material_name?: string;
  quantity: number;
  current_stage: ProductionStage;
}

// ─── Fırın Ekipmanı ──────────────────────────────────────────────────────────
export interface Kiln {
  id: number;
  name: string;
  power_kw: number;
}

// ─── Fırın ───────────────────────────────────────────────────────────────────
export type FiringType = 'bisque' | 'glaze' | 'decal';
export type KilnStatus = 'planned' | 'firing' | 'done';

export interface CustomKilnItem {
  product_id: number;
  product_name: string;
  quantity: number;
  color_recipe_id?: number;
  color_recipe_name?: string;
}

export interface KilnFiring {
  id: number;
  date: string;
  program_name?: string;
  temperature: number; // °C
  duration_hours?: number;
  firing_type: FiringType;
  status: KilnStatus;
  notes?: string;
  kiln_id?: number;
  kiln_name?: string;
  custom_items?: CustomKilnItem[];
  created_at: string;
  items?: KilnFiringItem[];
}

export interface KilnFiringItem {
  id: number;
  kiln_firing_id: number;
  production_item_id: number;
  product_name?: string;
  color_recipe_name?: string;
  liquid_clay_batch_name?: string;
  quantity: number;
}

// ─── Ürün Ağırlık Profili ─────────────────────────────────────────────────────
export type ProductWeightStage =
  | 'casting'           // Döküm Sonrası
  | 'drying'            // Kuruduktan Sonra
  | 'pre_bisque'        // Bisküvi Öncesi
  | 'post_bisque'       // Bisküvi Sonrası
  | 'pre_glaze'         // Sırlama Öncesi
  | 'post_glaze'        // Sırlama Sonrası
  | 'post_glaze_firing';// Sır Fırını Sonrası

export const WEIGHT_STAGES: ProductWeightStage[] = [
  'casting', 'drying', 'pre_bisque', 'post_bisque', 'pre_glaze', 'post_glaze', 'post_glaze_firing',
];

export const WEIGHT_STAGE_LABELS: Record<ProductWeightStage, string> = {
  casting:           'Döküm Sonrası',
  drying:            'Kuruduktan Sonra',
  pre_bisque:        'Bisküvi Öncesi',
  post_bisque:       'Bisküvi Sonrası',
  pre_glaze:         'Sırlama Öncesi',
  post_glaze:        'Sırlama Sonrası',
  post_glaze_firing: 'Sır Fırını Sonrası',
};

export interface ProductWeight {
  product_id: number;
  stage: ProductWeightStage;
  weight_gr: number;
  updated_at: string;
}

// ─── Elektrik Fiyatı ─────────────────────────────────────────────────────────
export interface ElectricityPrice {
  year: number;
  month: number;          // 1–12
  price_per_kwh: number;
}

// ─── Stok ─────────────────────────────────────────────────────────────────────
export type StockStage = 'bisque' | 'semi' | 'finished';

export interface StockEntry {
  id: number;
  product_id: number;
  product_name?: string;
  collection?: ProductCollection;
  quantity: number;
  stage: StockStage;
  updated_at: string;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export interface DashboardStats {
  totalMaterials: number;
  lowStockMaterials: number;
  activeBatches: number;
  plannedFirings: number;
  finishedStock: number;
  monthlyProduction: number;
}
