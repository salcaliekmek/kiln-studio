import { getDatabase } from '../db/database';
import { ColorRecipe, ColorRecipeComponent } from '../types';

export async function getColorRecipes(): Promise<ColorRecipe[]> {
  const db = await getDatabase();
  return db.getAllAsync<ColorRecipe>('SELECT * FROM color_recipes ORDER BY name');
}

export async function getColorRecipe(id: number): Promise<ColorRecipe | null> {
  const db = await getDatabase();
  const recipe = await db.getFirstAsync<ColorRecipe>(
    'SELECT * FROM color_recipes WHERE id = ?', [id]
  );
  if (!recipe) return null;
  recipe.components = await getColorRecipeComponents(id);
  return recipe;
}

export async function getColorRecipeComponents(recipeId: number): Promise<ColorRecipeComponent[]> {
  const db = await getDatabase();
  return db.getAllAsync<ColorRecipeComponent>(
    `SELECT crc.*, m.name as material_name
     FROM color_recipe_components crc
     JOIN materials m ON m.id = crc.material_id
     WHERE crc.color_recipe_id = ?
     ORDER BY m.name`,
    [recipeId]
  );
}

export async function addColorRecipe(
  data: Omit<ColorRecipe, 'id' | 'created_at' | 'components'>,
  components: Omit<ColorRecipeComponent, 'id' | 'color_recipe_id' | 'material_name'>[]
): Promise<number> {
  const db = await getDatabase();
  let recipeId = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO color_recipes (name, description, base_clay_quantity)
       VALUES (?, ?, ?)`,
      [data.name, data.description ?? null, data.base_clay_quantity]
    );
    recipeId = result.lastInsertRowId;
    for (const comp of components) {
      await db.runAsync(
        `INSERT INTO color_recipe_components (color_recipe_id, material_id, quantity)
         VALUES (?, ?, ?)`,
        [recipeId, comp.material_id, comp.quantity]
      );
    }
  });
  return recipeId;
}

export async function updateColorRecipe(
  id: number,
  data: Partial<Omit<ColorRecipe, 'id' | 'created_at' | 'components'>>,
  components?: Omit<ColorRecipeComponent, 'id' | 'color_recipe_id' | 'material_name'>[]
): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    if (Object.keys(data).length > 0) {
      const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
      const values = [...Object.values(data), id];
      await db.runAsync(`UPDATE color_recipes SET ${fields} WHERE id = ?`, values);
    }
    if (components) {
      await db.runAsync('DELETE FROM color_recipe_components WHERE color_recipe_id = ?', [id]);
      for (const comp of components) {
        await db.runAsync(
          `INSERT INTO color_recipe_components (color_recipe_id, material_id, quantity)
           VALUES (?, ?, ?)`,
          [id, comp.material_id, comp.quantity]
        );
      }
    }
  });
}

export async function deleteColorRecipe(id: number): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    // Referans veren tablolardaki color_recipe_id'yi NULL'a çek
    await db.runAsync('UPDATE liquid_clay_batches SET color_recipe_id = NULL WHERE color_recipe_id = ?', [id]);
    await db.runAsync('UPDATE production_items SET color_recipe_id = NULL WHERE color_recipe_id = ?', [id]);
    await db.runAsync('DELETE FROM color_recipes WHERE id = ?', [id]);
  });
}
