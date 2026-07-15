import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendSMS } from '../../../../lib/sms';

// Initialize Supabase admin client (requires service_role key to bypass RLS and insert into otp_sessions)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: Request) {
  try {
    const { phone } = await req.json();

    if (!phone) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    let sanitizedPhone = phone.replace(/\D/g, '');
    if (sanitizedPhone.startsWith('91') && sanitizedPhone.length === 12) {
      sanitizedPhone = sanitizedPhone.substring(2);
    }
    if (sanitizedPhone.length !== 10) {
      return NextResponse.json({ error: 'Invalid phone number. Must be exactly 10 digits.' }, { status: 400 });
    }

    // Generate a random 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Expire in 10 minutes
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    // Insert into otp_sessions table
    const { data, error } = await supabase
      .from('otp_sessions')
      .insert({
        phone,
        otp_code: otpCode,
        expires_at: expiresAt.toISOString(),
        is_verified: false,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error inserting OTP session:', error);
      return NextResponse.json({ error: 'Failed to initiate OTP session' }, { status: 500 });
    }

    // Send SMS via MSG91/JIO DLT
    try {
      await sendSMS(phone, otpCode);
      console.log(`\n========================================`);
      console.log(`[SMS SENT] To: ${phone} | OTP: ${otpCode}`);
      console.log(`========================================\n`);
    } catch (smsError: any) {
      console.error('Failed to send SMS via MSG91:', smsError.message);
      // Depending on requirements, we can either return an error or still succeed (mock mode)
      // Here we fail if SMS fails so the user knows
      return NextResponse.json({ error: 'Failed to send SMS to your number' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'OTP sent successfully',
      sessionId: data.id // Return session ID to the client to use during verification
    });

  } catch (error) {
    console.error('Send OTP Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
