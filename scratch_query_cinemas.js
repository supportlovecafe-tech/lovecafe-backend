const { createClient } = require('@supabase/supabase-js');
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://pwbvoosqunrvqewokynz.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function checkCinemas() {
  const { data: cinemas, error: err } = await supabase.from('cinemas').select('*');
  if (err) {
    console.error("Error fetching cinemas:", err);
    return;
  }
  console.log("Cinemas:");
  cinemas.forEach(c => {
    console.log(`- ID: ${c.id} | Name: ${c.name}`);
  });

  for (const c of cinemas) {
    console.log(`\nActive food items for cinema: ${c.name} (${c.id})`);
    const { data: foods, error: err2 } = await supabase
      .from('food_items')
      .select('id, name, is_available')
      .eq('cinema_id', c.id);
    if (err2) {
      console.error("Error fetching foods:", err2);
    } else {
      foods.forEach(f => {
        console.log(`  - Food: ${f.name} | ID: ${f.id} | Available: ${f.is_available}`);
      });
    }
  }
}

checkCinemas();
