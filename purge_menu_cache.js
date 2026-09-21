const { Redis } = require('@upstash/redis');
const fs = require('fs');
const path = require('path');

// Load .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) process.env[parts[0].trim()] = parts.slice(1).join('=').trim();
  });
}

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!redisUrl || !redisToken) {
  console.log('No Redis credentials found in .env, skipping Redis purge.');
  process.exit(0);
}

const redis = new Redis({ url: redisUrl, token: redisToken });

const cinemas = [
  'f115ebed-c919-4fd2-850a-f0deb0753936', // Atindra
  '647b4c19-096f-477a-bdb5-d2d8f04a0a1f', // Rathindra
  'fdaba7ea-cc1a-42a5-a1f2-3583d1de7894'  // Cinema Hut
];

async function clearCache() {
  console.log('Purging Redis cache for all outlets...');
  for (const id of cinemas) {
    const res1 = await redis.del(`menu:${id}`);
    const res2 = await redis.del(`combos:${id}`);
    console.log(`Cleared cinema ${id}: menu deleted=${res1}, combos deleted=${res2}`);
  }
  console.log('Redis cache successfully purged for all outlets.');
}

clearCache().catch(console.error);
