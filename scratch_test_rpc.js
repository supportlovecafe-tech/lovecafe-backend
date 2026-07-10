const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://pwbvoosqunrvqewokynz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3YnZvb3NxdW5ydnFld29reW56Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjY5NDAwOSwiZXhwIjoyMDkyMjcwMDA5fQ.agC_5TFDObPxs3CERbhnHCU0uM9WwlilUUDMiozRQAE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function tryExecSql() {
  const sql = `
    ALTER TABLE public.customer_profiles 
    ADD COLUMN IF NOT EXISTS secret_question text,
    ADD COLUMN IF NOT EXISTS secret_answer text;
  `;
  
  // Try common RPC names for executing SQL
  const rpcNames = ['exec_sql', 'run_sql', 'execute_sql', 'sql'];
  for (const name of rpcNames) {
    console.log(`Trying RPC: ${name}...`);
    try {
      const { data, error } = await supabase.rpc(name, { query: sql, sql: sql, sql_query: sql });
      if (error) {
        console.log(`RPC ${name} returned error:`, error.message);
      } else {
        console.log(`RPC ${name} succeeded! Result:`, data);
        return;
      }
    } catch (e) {
      console.log(`RPC ${name} threw exception:`, e.message);
    }
  }
}

tryExecSql();
