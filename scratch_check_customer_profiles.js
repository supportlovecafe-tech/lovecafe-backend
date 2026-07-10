const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://pwbvoosqunrvqewokynz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3YnZvb3NxdW5ydnFld29reW56Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjY5NDAwOSwiZXhwIjoyMDkyMjcwMDA5fQ.agC_5TFDObPxs3CERbhnHCU0uM9WwlilUUDMiozRQAE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCustomerProfilesSchema() {
  const { data, error } = await supabase
    .from('customer_profiles')
    .select('*')
    .limit(1);

  if (error) {
    console.error("Error querying customer_profiles table:", error.message);
  } else {
    console.log("customer_profiles schema keys:", Object.keys(data[0] || {}));
    console.log("Sample customer_profile:", data[0]);
  }
}

checkCustomerProfilesSchema();
