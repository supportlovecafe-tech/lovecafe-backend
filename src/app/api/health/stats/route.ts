import { NextResponse } from 'next/server';
import { redis, keys } from '@/lib/redis';
import { createAdminClient } from '@/lib/supabase/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');

  // Simple security check
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  try {
    const statsStart = Date.now();
    
    // 1. Redis Stats
    let queueLen = 0;
    let dlqLen = 0;
    let lastRun = null;
    let redisStatus = 'UP';

    try {
      [queueLen, dlqLen, lastRun] = await Promise.all([
        redis.llen(keys.orderQueue),
        redis.llen('order_dlq'),
        redis.get('worker:last_run')
      ]);
    } catch (e) {
        redisStatus = 'DOWN';
    }

    // 2. Database Stats
    const supabase = await createAdminClient();
    const dbStart = Date.now();
    const { error: dbError } = await supabase.from('cinemas').select('id', { count: 'exact', head: true }).limit(1);
    const dbLatency = Date.now() - dbStart;
    const dbStatus = dbError ? 'DOWN' : 'UP';

    // 3. System Load (Simulated for Vercel/Serverless)
    const overallLatency = Date.now() - statsStart;

    return NextResponse.json({
      status: (redisStatus === 'UP' && dbStatus === 'UP') ? 'HEALTHY' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      services: {
        redis: {
          status: redisStatus,
          queue_length: queueLen,
          dlq_length: dlqLen,
          last_worker_run: lastRun ? new Date(parseInt(lastRun as string)).toISOString() : 'NEVER'
        },
        database: {
          status: dbStatus,
          latency_ms: dbLatency,
          error: dbError?.message || null
        }
      },
      performance: {
        api_latency_ms: overallLatency
      }
    }, { headers: corsHeaders });

  } catch (error: any) {
    return NextResponse.json({ 
        status: 'CRITICAL', 
        error: error.message 
    }, { status: 500, headers: corsHeaders });
  }
}
