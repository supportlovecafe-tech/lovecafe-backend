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

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function checkProfiles() {
  console.log("=== PROFILES ===");
  const { data: profiles, error: err } = await supabase.from('profiles').select('*');
  if (err) {
    console.error("Error fetching profiles:", err);
  } else {
    profiles.forEach(p => {
      console.log(`- Role: ${p.role} | Email: ${p.email} | PIN: ${p.pin} | Password: ${p.password || p.access_key}`);
    });
  }

  console.log("\n=== CINEMAS ===");
  const { data: cinemas, error: err2 } = await supabase.from('cinemas').select('*');
  if (err2) {
    console.error("Error fetching cinemas:", err2);
  } else {
    cinemas.forEach(c => {
      console.log(`- Name: ${c.name} | Login Email: ${c.login_email} | Login Password: ${c.login_password}`);
    });
  }
}

checkProfiles();
