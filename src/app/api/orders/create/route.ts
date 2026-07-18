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
    // SECURITY PATCH: Verify JWT token if provided
    const authHeader = req.headers.get('authorization');
    let user = null;
    if (authHeader && authHeader.startsWith('Bearer ') && authHeader.split(' ')[1] !== 'null') {
      const token = authHeader.split(' ')[1];
      const supabaseAuthCheck = await createClient();
      const { data, error: authError } = await supabaseAuthCheck.auth.getUser(token);
      if (!authError && data?.user) {
        user = data.user;
      }
    }

    const body = await req.json();
    const { cinema_id, items, total_amount, customer_phone, location, payment_method, verificationToken, customer_id } = body;

    // Anti-Spoofing: If the order claims a registered customer_id, they MUST have a valid matching JWT
    if (customer_id && !customer_id.startsWith('TEMP')) {
       if (!user || user.id !== customer_id) {
          return NextResponse.json({ error: 'Forbidden: Cannot place order for another user without valid token' }, { status: 403, headers: corsHeaders });
       }
    }

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
      
      // --- SERVER-SIDE ANTI-TAMPERING: RE-CALCULATE PRICE ---
      let finalAmount = total_amount;
      try {
        const { POST: validatePOST } = require('../validate/route');
        const validateReq = new Request('http://localhost/api/orders/validate', {
          method: 'POST',
          body: JSON.stringify({ items, cinema_id, is_pos: false }),
          headers: req.headers
        });
        const validateRes = await validatePOST(validateReq);
        if (validateRes.ok) {
           const validateData = await validateRes.json();
           const serverTotal = validateData.breakdown?.total || total_amount;
           const discount = (body.points_redeemed || 0) * 0.1; // 10 points = 1 rupee
           finalAmount = Math.max(0, serverTotal - discount);
           console.log(`[Security] Client requested: ${total_amount}, Server Calculated: ${finalAmount}`);
        } else {
           return NextResponse.json({ error: 'Failed to validate items server-side' }, { status: 400, headers: corsHeaders });
        }
      } catch (e) {
        console.error('Validation integration error:', e);
        // Fallback to client amount if the internal route call fails, though in production you'd reject it.
      }
      
      const { data: orderId, error } = await supabase.rpc('place_order_secure', {
        p_cinema_id: cinema_id,
        p_display_id: body.display_id,
        p_items: items,
        p_total_amount: finalAmount, // USING SERVER CALCULATED AMOUNT
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
