import { redis, keys, getWithSWR, setWithSWR } from './redis';
import { createClient } from './supabase/server';

/**
 * Recommendation Service with Redis Cache
 * Reduces load from expensive aggregation queries
 */
export async function getCachedRecommendations(cinemaId: string, userId: string, phone: string) {
  const cacheKey = `${keys.recommendations(userId)}:${cinemaId}`;

  // 1. Try SWR fetch
  const { data, isStale } = await getWithSWR<any[]>(cacheKey);

  // 2. If fresh, return
  if (data && !isStale) return data;

  // 3. Revalidate
  const refreshPromise = (async () => {
    try {
      const supabase = await createClient();
      
      // Perform the aggregation query in DB
      const { data: rawOrders, error } = await supabase
        .from('orders')
        .select('items, timestamp')
        .eq('cinema_id', cinemaId)
        .neq('status', 'CANCELLED')
        .or(`customer_id.eq.${userId},customer_phone.eq.${phone}`)
        .order('timestamp', { ascending: false })
        .limit(30);

      if (error) throw error;

      // Aggregation logic (simplified version of Flutter logic)
      const aggregates: Record<string, any> = {};
      (rawOrders || []).forEach((order, idx) => {
        const weight = 30 - idx;
        const items = order.items as any[] || [];
        items.forEach(item => {
           if (item.food_id && !item.is_combo) {
             const id = item.food_id;
             if (!aggregates[id]) {
               aggregates[id] = { ...item, score: weight, count: 1 };
             } else {
               aggregates[id].score += weight;
               aggregates[id].count += 1;
             }
           }
        });
      });

      const sorted = Object.values(aggregates)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      await setWithSWR(cacheKey, sorted, 3600, 300); // 1 hour TTL, 5 min fresh
      return sorted;
    } catch (e) {
      console.error('Recommendation SWR Error:', e);
      return data;
    }
  })();

  return data || await refreshPromise;
}

export async function invalidateRecommendations(cinemaId: string, userId: string) {
  await redis.del(`${keys.recommendations(userId)}:${cinemaId}`);
}
