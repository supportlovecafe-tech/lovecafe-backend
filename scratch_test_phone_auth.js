const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testPhoneAuth() {
  const { data, error } = await supabase.auth.signInWithOtp({
    phone: '+919876543210',
  });
  console.log('Data:', data);
  console.log('Error:', error);
}

testPhoneAuth();
