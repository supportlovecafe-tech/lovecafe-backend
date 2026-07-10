// Node script to verify offers and offer_items tables on Supabase without external dotenv dependency
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually parse the .env file
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
  console.warn("⚠️ Warning: Could not read .env file directly, falling back to process.env variables:", e.message);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://pwbvoosqunrvqewokynz.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error("❌ Missing SUPABASE_SERVICE_ROLE_KEY in .env file!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function checkTables() {
  console.log("-----------------------------------------");
  console.log("CINEMA EATS - DATABASE VERIFICATION");
  console.log("-----------------------------------------");
  console.log("Supabase URL:", supabaseUrl);
  
  // 1. Query offers
  console.log("\n1. Testing query on 'offers' table...");
  const { data: offersData, error: offersError } = await supabase
    .from('offers')
    .select('*')
    .limit(5);

  if (offersError) {
    console.error("❌ 'offers' table query failed:", offersError.message);
  } else {
    console.log("✅ 'offers' table is active and accessible!");
    console.log(`   Found ${offersData.length} records.`);
  }

  // 2. Query offer_items
  console.log("\n2. Testing query on 'offer_items' table...");
  const { data: itemsData, error: itemsError } = await supabase
    .from('offer_items')
    .select('*')
    .limit(5);

  if (itemsError) {
    console.error("❌ 'offer_items' table query failed:", itemsError.message);
  } else {
    console.log("✅ 'offer_items' table is active and accessible!");
    console.log(`   Found ${itemsData.length} records.`);
  }
  
  console.log("-----------------------------------------");
}

checkTables();
