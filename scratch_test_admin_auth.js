const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testAdminUser() {
  const email = 'test_otp_user@cinemaeats.in';
  const password = 'SuperSecurePassword123!';
  
  // Create user
  const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { phone: '919876543210' }
  });
  
  console.log('Create Data:', createData?.user?.id);
  console.log('Create Error:', createError?.message);
  
  if (createData?.user) {
     const userId = createData.user.id;
     // Update password
     const { data: updateData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: 'NewPassword456!'
     });
     console.log('Update Error:', updateError?.message);
     
     // Try signing in with the new password
     const supabaseAnon = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
     );
     const { data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
        email,
        password: 'NewPassword456!'
     });
     console.log('Sign In Data:', !!signInData?.session);
     console.log('Sign In Error:', signInError?.message);
     
     // Cleanup
     await supabaseAdmin.auth.admin.deleteUser(userId);
  }
}

testAdminUser();
