require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkPolicies() {
  const { data, error } = await supabase.from('screens').select('*').limit(1);
  console.log('Test select:', error ? error.message : 'Success');
  
  // Create open policies for screens
  const query = `
    CREATE POLICY "Enable insert for all" ON "public"."screens" AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
    CREATE POLICY "Enable update for all" ON "public"."screens" AS PERMISSIVE FOR UPDATE TO public USING (true) WITH CHECK (true);
    CREATE POLICY "Enable delete for all" ON "public"."screens" AS PERMISSIVE FOR DELETE TO public USING (true);
  `;
  
  // Supabase JS doesn't support raw queries directly via client unless using an RPC.
  // We can try to use a REST endpoint or RPC if available. 
  // Let's just create an RPC to execute arbitrary SQL or assume it's easier.
}
checkPolicies();
