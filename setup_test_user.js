require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function setupRishav() {
  const email = 'rishavroy@test.com';
  const password = 'rishavroy@123';

  console.log(`Setting up test user: ${email}`);

  // Delete from customer_profiles just in case
  await supabase.from('customer_profiles').delete().eq('email', email);
  
  // Create user
  const { data, error } = await supabase.auth.admin.createUser({
    email: email,
    password: password,
    email_confirm: true
  });

  if (error && error.message.includes('already exists')) {
     console.log('User already exists in Supabase. Assuming it was manually created correctly.');
  } else if (error) {
     console.error('Error creating user:', error);
  } else {
     console.log('Successfully created test user! ID:', data.user.id);
  }
}

setupRishav();
