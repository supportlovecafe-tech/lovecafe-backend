// Node script to query food_items and print details
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

async function checkFoodItems() {
  const { data, error } = await supabase
    .from('food_items')
    .select('id, name, image_url, category, is_available')
    .eq('is_available', true);

  if (error) {
    console.error("Error querying food_items:", error.message);
  } else {
    console.log(`Active food items found: ${data.length}`);
    data.forEach(item => {
      console.log(`- ID: ${item.id} | Name: ${item.name} | Category: ${item.category} | Image: ${item.image_url}`);
    });
  }
}

checkFoodItems();
