import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Admin client securely using service role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  // Add CORS headers for the frontend
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { headers: corsHeaders });
  }

  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    console.log(`[API] Admin setup requested for outlet user: ${email}`);

    // Try to create the user
    let { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    let userId = createData?.user?.id;

    // If user already exists, update their password instead
    if (createError && createError.message.includes('already registered')) {
      console.log(`[API] User already exists, attempting to update password...`);
      
      const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) throw listError;

      const existingUser = usersData.users.find(u => u.email === email);
      
      if (!existingUser) {
        throw new Error("User email registered but cannot be found in user list.");
      }

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
        password: password
      });

      if (updateError) throw updateError;
      userId = existingUser.id;
    } else if (createError) {
      throw createError;
    }

    // Ensure the user has the OUTLET_MANAGER role in profiles
    if (userId) {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({ 
            id: userId,
            email: email,
            role: 'OUTLET_MANAGER'
        }, { onConflict: 'email' });
        
      if (profileError) throw profileError;
    }

    return NextResponse.json(
      { success: true, message: 'User setup securely' },
      { headers: corsHeaders }
    );

  } catch (error: any) {
    console.error('[API] Error in setup-outlet-user:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
