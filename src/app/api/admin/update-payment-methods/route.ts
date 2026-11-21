import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const { cinemaId, allowedPaymentMethods } = await req.json();

    if (!cinemaId) {
      return NextResponse.json({ error: 'cinemaId is required' }, { status: 400, headers: corsHeaders });
    }

    if (!Array.isArray(allowedPaymentMethods) || allowedPaymentMethods.length === 0) {
      return NextResponse.json(
        { error: 'You must select at least one active payment method' }, 
        { status: 400, headers: corsHeaders }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('cinemas')
      .update({ 
        allowed_payment_methods: allowedPaymentMethods,
        updated_at: new Date().toISOString()
      })
      .eq('id', cinemaId)
      .select('id, name, allowed_payment_methods');

    if (error) {
      console.error('[API] Error updating cinema allowed_payment_methods:', error);
      throw error;
    }

    return NextResponse.json({ 
      success: true, 
      cinemaId, 
      allowedPaymentMethods: data?.[0]?.allowed_payment_methods || allowedPaymentMethods 
    }, { headers: corsHeaders });

  } catch (error: any) {
    console.error('[API] Error in update-payment-methods:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' }, 
      { status: 500, headers: corsHeaders }
    );
  }
}
