// Node script to clear Redis cache keys manually
const { Redis } = require('@upstash/redis');
const fs = require('fs');
const path = require('path');

try {
  const envPath = path.join(__dirname, '.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      process.env[key] = val;
    }
  });
} catch (e) {
  console.warn("Could not read .env file directly", e.message);
}

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!redisUrl || !redisToken) {
  console.error("Missing UPSTASH_REDIS credentials in .env!");
  process.exit(1);
}

const redis = new Redis({ url: redisUrl, token: redisToken });

async function clearCache() {
  console.log("Connecting to Upstash Redis...");
  try {
    // Since Upstash supports scanning or matching keys, we can delete the general patterns
    // For safety, let's delete keys for the primary cinema halls, or check if we can query keys
    // In Upstash, we can use redis.keys('*') to find all keys
    const keys = await redis.keys('*');
    console.log(`Found keys in Redis:`, keys);
    
    const cacheKeys = keys.filter(k => k.startsWith('menu:') || k.startsWith('combos:'));
    if (cacheKeys.length === 0) {
      console.log("No menu or combos cache keys found in Redis.");
      return;
    }

    console.log(`Deleting cache keys:`, cacheKeys);
    for (const key of cacheKeys) {
      await redis.del(key);
      console.log(`- Deleted: ${key}`);
    }
    console.log("All Redis menu/combos caches have been successfully invalidated!");
  } catch (error) {
    console.error("Error clearing Redis cache:", error.message);
  }
}

clearCache();
