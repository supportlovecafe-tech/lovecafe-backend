import { NextResponse } from 'next/server';
import { redis, keys, isRateLimited, checkIdempotency, updateIdempotencyStatus } from '@/lib/redis';
import { createClient } from '@/lib/supabase/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-idempotency-key',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'anonymous';
    const idempotencyKey = req.headers.get('x-idempotency-key');

    if (!idempotencyKey) {
      return NextResponse.json({ error: 'Missing x-idempotency-key header' }, { status: 400, headers: corsHeaders });
    }

    /* Rate limiting disabled for local stability */
    // try {
    //   if (await isRateLimited(`orders:rate:${ip}`, 2, 60)) {
    //     return NextResponse.json({ error: 'Rate limit exceeded. Please wait.' }, { status: 429, headers: corsHeaders });
    //   }
    // } catch (e) {
    //   console.warn('[Redis] Rate limiting unavailable, bypassing...');
    // }

    // 2. Distributed Locking & Idempotency Check (Redis Phase)
    let redisIdempotencyExists = false;
    const lockKey = `lock:order:${idempotencyKey}`;
    try {
      const acquired = await redis.set(lockKey, 'locked', { nx: true, ex: 30 });
      if (!acquired) {
        const cachedResp = await redis.get(keys.idempotencyResp(idempotencyKey));
        if (cachedResp) {
           return NextResponse.json(JSON.parse(cachedResp as string), { status: 200, headers: corsHeaders });
        }
        return NextResponse.json({ error: 'Order processing in progress' }, { status: 409, headers: corsHeaders });
      }
      
      const idenStatus = await checkIdempotency(idempotencyKey);
      if (idenStatus === 'exists') {
        redisIdempotencyExists = true;
      }
    } catch (e) {
      console.warn('[Redis] Idempotency check unavailable, falling back to DB uniqueness.');
    }

    if (redisIdempotencyExists) {
      try {
        const currentStatus = await redis.get(keys.idempotencyResp(idempotencyKey));
        return NextResponse.json(
          currentStatus ? JSON.parse(currentStatus as string) : { message: 'Order already processed' }, 
          { status: 200, headers: corsHeaders }
        );
      } catch (e) {}
    }

    // 3. Parse and Validate Payload
    const body = await req.json();
    const { cinema_id, items, total_amount, customer_phone, location, payment_method, verificationToken } = body;

    if (!cinema_id || !items || !total_amount || !customer_phone || !location) {
      try { await redis.del(lockKey); } catch (e) {}
      return NextResponse.json({ error: 'Invalid order data' }, { status: 400, headers: corsHeaders });
    }

    const p_payment_method = payment_method || 'DEMO_UPI';

    if (p_payment_method === 'CASH') {
      if (!verificationToken) {
        try { await redis.del(lockKey); } catch (e) {}
        return NextResponse.json({ error: 'OTP Verification Token is required for Cash on Delivery' }, { status: 400, headers: corsHeaders });
      }
      const supabaseAuthCheck = await createClient();
      const { data: session, error: sessionError } = await supabaseAuthCheck
        .from('otp_sessions')
        .select('is_verified')
        .eq('id', verificationToken)
        .single();
        
      if (sessionError || !session || !session.is_verified) {
         try { await redis.del(lockKey); } catch (e) {}
         return NextResponse.json({ error: 'Invalid or unverified OTP token' }, { status: 400, headers: corsHeaders });
      }
    }

    // 4. Processing Phase (FORCE DIRECT DB INSERT FOR LOCAL STABILITY)
    try {
      // Bypassing Redis Queue to avoid connection hangs on local machines
      throw new Error('Local Stability Mode: Bypassing Redis Queue');
    } catch (e) {
      console.error('[Redis] Queueing failed, falling back to direct Supabase insert:', e);
      
      // DIRECT DB FALLBACK - Using Secure RPC
      const supabase = await createClient();
      const { data: orderId, error } = await supabase.rpc('place_order_secure', {
        p_cinema_id: cinema_id,
        p_display_id: body.display_id,
        p_items: items,
        p_total_amount: total_amount,
        p_location: location,
        p_customer_phone: customer_phone,
        p_client_uuid: idempotencyKey,
        p_payment_method: body.payment_method || 'DEMO_UPI',
        p_points_redeemed: body.points_redeemed || 0,
        p_points_earned: body.points_earned || 0,
        p_customer_id: body.customer_id,
        p_customer_profile_id: body.customer_profile_id,
        p_metadata: body.metadata || {}
      });

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json({ success: true, message: 'Order already exists', id: idempotencyKey }, { status: 200, headers: corsHeaders });
        }
        throw error;
      }

      return NextResponse.json({ success: true, message: 'Order created (Secure Fallback)', id: orderId }, { status: 201, headers: corsHeaders });
    }

  } catch (error: any) {
    console.error('Order Create Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500, headers: corsHeaders });
  }
}
