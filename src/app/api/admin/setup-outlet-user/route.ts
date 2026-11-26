import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Admin client securely using service role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { headers: corsHeaders });
}

export async function POST(req: NextRequest) {

  try {
    const { email, password, cinemaId } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    console.log(`[API] Admin setup requested for outlet user: ${normalizedEmail}`);

    // Try to create the user
    let { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
    });

    let userId = createData?.user?.id;

    // If user already exists, update their password instead
    if (createError && createError.message.includes('already')) {
      console.log(`[API] User already exists, attempting to update password...`);
      
      // Look up the user ID from our profiles table (much faster/safer than listUsers)
      const { data: profileData, error: profileErr } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', normalizedEmail)
        .single();
        
      if (profileErr || !profileData) {
        // Fallback if not in profiles: just try to proceed, but log the error
        console.error("Could not find existing user in profiles:", profileErr);
        throw new Error("User exists in auth but missing from profiles. Please contact support to link them.");
      }

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(profileData.id, {
        password: password
      });

      if (updateError) throw updateError;
      userId = profileData.id;
    } else if (createError) {
      throw createError;
    }

    // Resolve cinema_id from explicit param or matching cinemas.login_email so orders RLS always matches
    let resolvedCinemaId = cinemaId || null;
    if (!resolvedCinemaId) {
      const { data: matchedCinema } = await supabaseAdmin
        .from('cinemas')
        .select('id')
        .ilike('login_email', normalizedEmail)
        .maybeSingle();
      if (matchedCinema?.id) {
        resolvedCinemaId = matchedCinema.id;
      }
    }

    // Ensure the user has the OUTLET_MANAGER role (and cinema_id when known) in profiles
    if (userId) {
      const profileUpsert: Record<string, any> = {
        id: userId,
        email: normalizedEmail,
        role: 'OUTLET_MANAGER',
      };
      if (resolvedCinemaId) {
        profileUpsert.cinema_id = resolvedCinemaId;
      }

      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert(profileUpsert, { onConflict: 'email' });
        
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
