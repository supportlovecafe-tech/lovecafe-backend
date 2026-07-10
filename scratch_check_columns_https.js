const https = require('https');
const fs = require('fs');

let supabaseUrl = '';
let supabaseKey = '';

function parseEnv(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const env = {};
    content.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const index = trimmed.indexOf('=');
      if (index === -1) return;
      const key = trimmed.substring(0, index).trim();
      const val = trimmed.substring(index + 1).trim().replace(/(^["']|["']$)/g, '');
      env[key] = val;
    });
    return env;
  } catch (e) {
    return null;
  }
}

let env = parseEnv('.env.local') || parseEnv('.env') || parseEnv('../.env') || parseEnv('cinema-backend/.env');

if (env) {
  supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
}

const url = `${supabaseUrl}/rest/v1/`;

https.get(url, {
  headers: {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log("Database tables:");
      console.log(Object.keys(parsed.paths || {}).map(p => p.split('/')[1]).filter((v, i, a) => v && a.indexOf(v) === i));
    } catch (e) {
      console.error("Failed to parse JSON:", e.message);
    }
  });
});
