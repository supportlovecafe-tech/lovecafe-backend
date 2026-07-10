import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
// Admin client required to update passwords and create users securely
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: Request) {
  try {
    const { phone, otpCode, firstName, lastName } = await req.json();

    if (!phone || !otpCode) {
      return NextResponse.json({ error: 'Phone and OTP code are required' }, { status: 400 });
    }

    // 1. Verify the OTP (similar to verify-otp, but we check if it matches the phone)
    // Find the latest valid OTP session for this phone
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('otp_sessions')
      .select('*')
      .eq('phone', phone)
      .eq('is_verified', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Invalid or expired OTP session' }, { status: 404 });
    }

    if (new Date() > new Date(session.expires_at)) {
      return NextResponse.json({ error: 'OTP has expired' }, { status: 400 });
    }

    if (session.otp_code !== otpCode) {
      return NextResponse.json({ error: 'Invalid OTP code' }, { status: 400 });
    }

    // Mark OTP as verified
    await supabaseAdmin
      .from('otp_sessions')
      .update({ is_verified: true })
      .eq('id', session.id);

    // 2. Generate Dummy Email & Secure Password
    // Format phone to standard format, removing plus signs, spaces, etc.
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const proxyEmail = `${cleanPhone}@cinemaeats.in`;
    const randomPassword = crypto.randomBytes(16).toString('hex') + 'A1!'; // Ensure complex password

    // 3. Find if user already exists using Admin Auth
    const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (usersError) {
       console.error('Error listing users:', usersError);
       return NextResponse.json({ error: 'Failed to authenticate user' }, { status: 500 });
    }

    const existingUser = usersData.users.find(u => u.email === proxyEmail);

    let finalUserId = null;

    if (existingUser) {
      // Update existing user password
      finalUserId = existingUser.id;
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
        password: randomPassword
      });

      if (updateError) {
         console.error('Error updating user password:', updateError);
         return NextResponse.json({ error: 'Failed to authenticate user' }, { status: 500 });
      }
    } else {
      // Create new user
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: proxyEmail,
        password: randomPassword,
        email_confirm: true,
        user_metadata: {
           first_name: firstName || '',
           last_name: lastName || '',
           full_name: `${firstName || ''} ${lastName || ''}`.trim(),
           phone: phone,
           role: 'CUSTOMER'
        }
      });

      if (createError) {
         console.error('Error creating user:', createError);
         return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
      }
      finalUserId = newUser.user?.id;
    }

    // Note: The public.customer_profiles table will be populated by the Supabase auth trigger
    // if this is a new user. If they are an existing user, their profile already exists.

    // 4. Return credentials securely to client
    return NextResponse.json({
      success: true,
      email: proxyEmail,
      password: randomPassword
    });

  } catch (error) {
    console.error('Phone Login Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
