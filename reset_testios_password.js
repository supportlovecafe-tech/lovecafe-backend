const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('Resetting password for: testios@test.com');
  
  // First, find the user
  const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  
  if (listError) {
    console.error('Error fetching users:', listError);
    return;
  }
  
  const testUser = users.find(u => u.email === 'testios@test.com');
  
  if (!testUser) {
    console.log('User not found in list (should not happen)');
    return;
  }
  
  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
    testUser.id,
    { password: 'testios@123' }
  );

  if (error) {
    console.error('Error updating password:', error.message);
  } else {
    console.log('Password reset successfully to testios@123!');
  }
}

main();
