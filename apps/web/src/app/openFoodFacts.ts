import type { Macros } from '@fitapp/domain';

export interface ScannedProduct {
  name: string;
  brand: string | null;
  per100: Macros;
}

/** A barcode as the scanner reads it (EAN-8/13, UPC-A 12, ITF-14). */
export const isBarcode = (s: string): boolean => /^\d{8,14}$/.test(s);

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

/**
 * Looks a product up in Open Food Facts (open database, filled in by users, so the coverage of Russian products is incomplete).
 * Returns null when the product is not there or has no calorie data; throws when there is no network.
 */
export async function lookupBarcode(code: string, signal?: AbortSignal): Promise<ScannedProduct | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_ru,brands,nutriments`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const body = (await res.json()) as { status?: number; product?: { product_name?: string; product_name_ru?: string; brands?: string; nutriments?: Record<string, unknown> } };
  const p = body.product;
  if (body.status !== 1 || !p?.nutriments) return null;
  const n = p.nutriments;
  const kcal = num(n['energy-kcal_100g']) || Math.round(num(n['energy_100g']) / 4.184);
  const name = (p.product_name_ru || p.product_name || '').trim();
  if (!name || kcal <= 0) return null;
  const per100: Macros = { kcal: Math.round(kcal), proteinG: num(n['proteins_100g']), fatG: num(n['fat_100g']), carbG: num(n['carbohydrates_100g']), fiberG: num(n['fiber_100g']) };
  if (per100.proteinG + per100.fatG + per100.carbG > 100.5) return null;
  return { name, brand: p.brands?.split(',')[0]?.trim() || null, per100 };
}
