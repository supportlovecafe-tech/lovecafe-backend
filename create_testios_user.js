const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('Creating test user: testios@test.com');
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: 'testios@test.com',
    password: 'testios@123',
    email_confirm: true,
    user_metadata: {
      role: 'CUSTOMER',
      full_name: 'Apple Reviewer',
      first_name: 'Apple',
      last_name: 'Reviewer'
    }
  });

  if (error) {
    if (error.message.includes('already registered')) {
        console.log('User already exists. You are good to go!');
    } else {
        console.error('Error creating user:', error.message);
    }
  } else {
    console.log('User created successfully:', data.user.id);
  }
}

main();
