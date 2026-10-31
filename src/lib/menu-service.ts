import { redis, keys, getWithSWR, setWithSWR } from './redis';
import { createClient } from './supabase/server';

/**
 * Menu Caching Service with SWR
 */
/**
 * Helper to fetch outlet-specific availability overrides
 */
async function fetchOutletAvailabilityMap(supabase: any, cinemaId: string, itemType: 'FOOD' | 'COMBO'): Promise<Map<string, boolean>> {
  try {
    const { data, error } = await supabase
      .from('outlet_item_availability')
      .select('item_id, is_available')
      .eq('cinema_id', cinemaId)
      .eq('item_type', itemType);
    if (!error && data) {
      const map = new Map<string, boolean>();
      for (const row of data) {
        map.set(row.item_id, row.is_available);
      }
      return map;
    }
  } catch (e) {
    // Graceful fallback if table not yet migrated
  }
  return new Map<string, boolean>();
}

/**
 * Menu Caching Service with SWR
 */
export async function getCachedMenu(cinemaId: string) {
  // Bypass caching completely in development mode for instant updates
  if (process.env.NODE_ENV === 'development') {
    try {
      const supabase = await createClient();
      const [foodRes, availabilityMap] = await Promise.all([
        supabase
          .from('food_items')
          .select('id, name, description, price, image_url, category, cinema_id, is_available')
          .or(`cinema_id.eq.${cinemaId},cinema_id.is.null`)
          .eq('is_available', true),
        fetchOutletAvailabilityMap(supabase, cinemaId, 'FOOD')
      ]);

      if (!foodRes.error && foodRes.data) {
        return foodRes.data.filter((item: any) => {
          if (availabilityMap.has(item.id)) {
            return availabilityMap.get(item.id) === true;
          }
          return item.is_available === true;
        });
      }
    } catch (e) {
      console.error('DEV MODE Fetch Error:', e);
    }
  }

  const cacheKey = keys.menuCache(cinemaId);

  // 1. Try SWR fetch
  const { data, isStale } = await getWithSWR<any[]>(cacheKey);

  // 2. If hit and fresh, return instantly
  if (data && !isStale) {
    return data;
  }

  // 3. Revalidate in background if stale or miss
  const refreshPromise = (async () => {
    try {
      const supabase = await createClient();
      const [foodRes, availabilityMap] = await Promise.all([
        supabase
          .from('food_items')
          .select('id, name, description, price, image_url, category, cinema_id, is_available')
          .or(`cinema_id.eq.${cinemaId},cinema_id.is.null`)
          .eq('is_available', true),
        fetchOutletAvailabilityMap(supabase, cinemaId, 'FOOD')
      ]);

      if (!foodRes.error && foodRes.data) {
        const freshData = foodRes.data.filter((item: any) => {
          if (availabilityMap.has(item.id)) {
            return availabilityMap.get(item.id) === true;
          }
          return item.is_available === true;
        });

        await setWithSWR(cacheKey, freshData, 600, 60); // 10 min TTL, 1 min fresh
        return freshData;
      }
    } catch (e) {
      console.error('SWR Revalidation Error:', e);
    }
    return data;
  })();

  // 4. Return stale data immediately, or wait for fresh if miss
  return data || await refreshPromise;
}

/**
 * Combo Caching Service with SWR
 */
export async function getCachedCombos(cinemaId: string) {
  // Bypass caching completely in development mode for instant updates
  if (process.env.NODE_ENV === 'development') {
    try {
      const supabase = await createClient();
      const [comboRes, availabilityMap] = await Promise.all([
        supabase
          .from('combos')
          .select('id, name, description, price, image_url, category, cinema_id, is_available, combo_items(*)')
          .or(`cinema_id.eq.${cinemaId},cinema_id.is.null`)
          .eq('is_available', true),
        fetchOutletAvailabilityMap(supabase, cinemaId, 'COMBO')
      ]);

      if (!comboRes.error && comboRes.data) {
        return comboRes.data.filter((combo: any) => {
          if (availabilityMap.has(combo.id)) {
            return availabilityMap.get(combo.id) === true;
          }
          return combo.is_available === true;
        });
      }
    } catch (e) {
      console.error('DEV MODE Combo Fetch Error:', e);
    }
  }

  const cacheKey = keys.comboCache(cinemaId);
  const { data, isStale } = await getWithSWR<any[]>(cacheKey);

  if (data && !isStale) return data;

  const refreshPromise = (async () => {
    try {
      const supabase = await createClient();
      const [comboRes, availabilityMap] = await Promise.all([
        supabase
          .from('combos')
          .select('id, name, description, price, image_url, category, cinema_id, is_available, combo_items(*)')
          .or(`cinema_id.eq.${cinemaId},cinema_id.is.null`)
          .eq('is_available', true),
        fetchOutletAvailabilityMap(supabase, cinemaId, 'COMBO')
      ]);

      if (!comboRes.error && comboRes.data) {
        const freshData = comboRes.data.filter((combo: any) => {
          if (availabilityMap.has(combo.id)) {
            return availabilityMap.get(combo.id) === true;
          }
          return combo.is_available === true;
        });

        await setWithSWR(cacheKey, freshData, 600, 60);
        return freshData;
      }
    } catch (e) {
      console.error('Combo SWR Revalidation Error:', e);
    }
    return data;
  })();

  return data || await refreshPromise;
}

/**
 * Invalidate outlet caches (or all outlets if 'ALL' or undefined)
 */
export async function invalidateMenuCache(cinemaId?: string | null) {
  try {
    if (!cinemaId || cinemaId === 'ALL') {
      const supabase = await createClient();
      const { data: cinemas } = await supabase.from('cinemas').select('id');
      if (cinemas && cinemas.length > 0) {
        const promises: Promise<any>[] = [];
        for (const c of cinemas) {
          promises.push(redis.del(keys.menuCache(c.id)));
          promises.push(redis.del(keys.comboCache(c.id)));
        }
        await Promise.all(promises);
      }
      return;
    }

    await Promise.all([
      redis.del(keys.menuCache(cinemaId)),
      redis.del(keys.comboCache(cinemaId))
    ]);
  } catch (e) {
    console.error('Failed to invalidate menu cache:', e);
  }
}
