import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: Request) {
  try {
    const { sessionId, otpCode } = await req.json();

    if (!sessionId || !otpCode) {
      return NextResponse.json({ error: 'Session ID and OTP code are required' }, { status: 400 });
    }

    // Fetch the session from the database
    const { data: session, error } = await supabase
      .from('otp_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error || !session) {
      return NextResponse.json({ error: 'Invalid or expired OTP session' }, { status: 404 });
    }

    // Check if it's already verified
    if (session.is_verified) {
      return NextResponse.json({ error: 'OTP is already verified' }, { status: 400 });
    }

    // Check if it's expired
    const now = new Date();
    const expiresAt = new Date(session.expires_at);
    if (now > expiresAt) {
      return NextResponse.json({ error: 'OTP has expired' }, { status: 400 });
    }

    // Check if the code matches
    if (session.otp_code !== otpCode) {
      return NextResponse.json({ error: 'Invalid OTP code' }, { status: 400 });
    }

    // Mark as verified
    const { error: updateError } = await supabase
      .from('otp_sessions')
      .update({ is_verified: true })
      .eq('id', sessionId);

    if (updateError) {
      console.error('Error updating OTP session:', updateError);
      return NextResponse.json({ error: 'Failed to verify OTP' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Phone number verified successfully',
      verificationToken: sessionId // Returning the sessionId as a proof-of-verification token
    });

  } catch (error) {
    console.error('Verify OTP Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
