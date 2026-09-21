require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testDelete() {
  const email = 'delete_test@test.com';
  const password = 'testpassword123';

  // 1. Create a user
  const { data: user, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError) {
    console.error('Error creating user:', createError);
    // Ignore if already exists
  }
  
  console.log('Sign in to get JWT');
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { error: signInError } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    console.error('Error signing in:', signInError);
    return;
  }
  console.log('Signed in successfully');

  // 3. Call the RPC
  const { error: rpcError } = await anonClient.rpc('delete_user_account');

  if (rpcError) {
    console.error('RPC Error:', rpcError);
  } else {
    console.log('RPC succeeded! Account deleted.');
  }
}
testDelete();
