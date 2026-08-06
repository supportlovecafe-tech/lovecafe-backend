const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function setupOutletLogin() {
  const email = process.argv[2];
  const password = process.argv[3];
  
  if (!email || !password) {
    console.log("Usage: node create-outlet-login.js <email> <password>");
    process.exit(1);
  }

  console.log(`Setting up login for: ${email}...`);

  // 1. Try to create the user
  let { data: userRecord, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: email,
    password: password,
    email_confirm: true, // Auto-confirm
  });

  if (createError) {
    if (createError.message.includes("already registered")) {
      console.log(`User already exists. Updating password instead...`);
      // Unfortunately Supabase JS doesn't have a simple getUserByEmail.
      // We will list users and find the ID.
      const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) {
         console.log("Error finding user:", listError);
         return;
      }
      
      const existingUser = usersData.users.find(u => u.email === email);
      if (existingUser) {
         const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
             password: password
         });
         if (updateError) {
             console.log("Failed to update password:", updateError);
             return;
         }
         userRecord = { user: existingUser };
         console.log("Password updated successfully!");
      } else {
         console.log("Could not find user in list.");
         return;
      }
    } else {
      console.log("Error creating user:", createError.message);
      return;
    }
  } else {
      console.log("User created successfully!");
  }

  // 2. Add to profiles table as OUTLET_MANAGER
  if (userRecord && userRecord.user) {
      console.log("Setting role to OUTLET_MANAGER in profiles table...");
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({ 
            id: userRecord.user.id,
            email: email,
            role: 'OUTLET_MANAGER'
        }, { onConflict: 'email' });
        
      if (profileError) {
          console.log("Error setting profile role:", profileError);
      } else {
          console.log("✅ Done! The outlet can now log in.");
      }
  }
}

setupOutletLogin();
