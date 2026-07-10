import { Redis } from '@upstash/redis'

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

// Create a dummy redis client if env vars are missing to prevent build failure during static generation
export const redis = (redisUrl && redisToken) 
  ? new Redis({ url: redisUrl, token: redisToken })
  : {
      incr: async () => 1,
      expire: async () => true,
      set: async () => "OK",
      get: async () => null,
      del: async () => 1,
      lpush: async () => 1,
      rpop: async () => null,
      llen: async () => 0,
      lrem: async () => 1,
    } as unknown as Redis;

// Redis keys structure
export const keys = {
  otp: (phone: string) => `otp:${phone}`,
  rateLimit: (identifier: string) => `rl:${identifier}`,
  attempts: (phone: string) => `otp_attempts:${phone}`,
  idempotency: (key: string) => `idempotency:${key}`,
  orderQueue: 'order_queue',
  processingQueue: 'order_processing', // Reliable Queue Pattern
  menuCache: (cinemaId: string) => `menu:${cinemaId}`,
  comboCache: (cinemaId: string) => `combos:${cinemaId}`,
  recommendations: (userId: string) => `recs:${userId}`,
  idempotencyResp: (key: string) => `idempotency:resp:${key}`,
}

/**
 * SWR Cache Helper
 * Returns { data, stale }
 */
export async function getWithSWR<T>(key: string): Promise<{ data: T | null, isStale: boolean }> {
  try {
    const cached = await redis.get(key);
    if (!cached) return { data: null, isStale: true };

    const entry = typeof cached === 'string' ? JSON.parse(cached) : cached;
    const now = Date.now();
    const isStale = now > entry.revalidateAt;

    return { data: entry.data as T, isStale };
  } catch (e) {
    console.warn(`[Redis] getWithSWR failed for key ${key}, falling back to DB:`, e);
    return { data: null, isStale: true };
  }
}

export async function setWithSWR(key: string, data: any, ttl: number = 600, swr: number = 60) {
  try {
    const entry = {
      data,
      revalidateAt: Date.now() + (swr * 1000),
    };
    await redis.set(key, JSON.stringify(entry), { ex: ttl });
  } catch (e) {
    console.error(`[Redis] setWithSWR failed for key ${key}:`, e);
  }
}

/**
 * Basic Rate Limiter using Redis INCR and EXPIRE
 */
export async function isRateLimited(identifier: string, limit: number = 5, windowInSeconds: number = 10): Promise<boolean> {
  try {
    const key = keys.rateLimit(identifier);
    const count = await redis.incr(key);
    
    if (count === 1) {
      await redis.expire(key, windowInSeconds);
    }
    
    return count > limit;
  } catch (e) {
    console.error(`[Redis] Rate limiting failed for ${identifier}, bypassing:`, e);
    return false; // Fail open to avoid blocking legitimate users during Redis downtime
  }
}

/**
 * Idempotency check: Set a key if it doesn't exist.
 * Returns 'new' if it was set, 'exists' if it already was there.
 */
export async function checkIdempotency(key: string, ttlSeconds: number = 3600): Promise<'new' | 'exists'> {
  const fullKey = keys.idempotency(key);
  const set = await redis.set(fullKey, 'processing', { nx: true, ex: ttlSeconds });
  return set ? 'new' : 'exists';
}

export async function updateIdempotencyStatus(key: string, status: string, ttlSeconds: number = 86400) {
  await redis.set(keys.idempotency(key), status, { ex: ttlSeconds });
}
