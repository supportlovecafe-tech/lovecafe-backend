import { NextResponse } from 'next/server';
import { redis, keys, updateIdempotencyStatus } from '@/lib/redis';
import { createAdminClient } from '@/lib/supabase/server';

// Production Tuning for Burst Traffic
const BATCH_SIZE = 20;          // Parallel DB writes per iteration
const MAX_RUN_TIME = 45000;     // Stop at 45s (Safer buffer for 60s Vercel timeout)
const POLL_INTERVAL = 2000;     // Wait 2s if queue is empty
const RECOVERY_BATCH = 10;      // Items to recover from 'processing' list per run

/**
 * PRODUCTION WORKER API
 * Optimized for high-concurrency (1000+ orders) and zero loss.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');

  // 1. SECURE AUTH (Query Param)
  if (!secret || secret !== process.env.CRON_SECRET) {
    console.error('[Worker] Unauthorized access attempt - Invalid Secret');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createAdminClient();
  const startTime = Date.now();
  let totalProcessed = 0;
  let totalFailed = 0;

  console.log('[Worker] Reliable Cycle Started.');
  try {
    await redis.set('worker:last_run', Date.now().toString());
  } catch (e) {
    console.warn('[Worker] Failed to update last_run timestamp:', e);
  }

  try {
    // 2. RECOVERY: Fetch items stuck in 'order_processing' from previous crashes
    const stuckCount = await redis.llen(keys.processingQueue);
    if (stuckCount > 0) {
      console.warn(`[Worker] Recovering ${stuckCount} stuck orders from previous run...`);
      for (let i = 0; i < RECOVERY_BATCH; i++) {
        // Atomic Move back to main queue (simulated for type safety)
        const item = await redis.rpop(keys.processingQueue);
        if (item) await redis.lpush(keys.orderQueue, item);
      }
    }

    // 3. GREEDY PROCESSING LOOP (Achieves high-frequency processing)
    while (Date.now() - startTime < MAX_RUN_TIME) {
      const activeOrders = [];
      
      // Manual Move: (Move from queue to processing list)
      // Note: simulated for type safety without rpoplpush
      for (let i = 0; i < BATCH_SIZE; i++) {
        const order = await redis.rpop(keys.orderQueue);
        if (order) {
          await redis.lpush(keys.processingQueue, order);
          activeOrders.push(order);
        }
      }

      if (activeOrders.length === 0) {
        // Queue empty? Wait a bit then check
        const queueLength = await redis.llen(keys.orderQueue);
        if (queueLength > 0) {
          console.log(`[Worker] ${queueLength} orders in queue. Processing batch...`);
        }
        if (Date.now() - startTime > MAX_RUN_TIME - 5000) break;
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
        continue;
      }

      // 4. BATCH PROCESSING (Parallel DB Writes)
      const batchStart = Date.now();
      const results = await Promise.allSettled(activeOrders.map(async (raw) => {
        const orderData = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const { idempotencyKey, ...dbData } = orderData;

        try {
          // INSERT into Supabase via Secure RPC
          const { data: orderId, error } = await supabase.rpc('place_order_secure', {
            p_cinema_id: dbData.cinema_id,
            p_display_id: dbData.display_id,
            p_items: dbData.items,
            p_total_amount: dbData.total_amount,
            p_location: dbData.location,
            p_customer_phone: dbData.customer_phone,
            p_client_uuid: idempotencyKey,
            p_payment_method: dbData.payment_method || 'DEMO_UPI',
            p_points_redeemed: dbData.points_redeemed || 0,
            p_points_earned: dbData.points_earned || 0,
            p_customer_id: dbData.customer_id,
            p_customer_profile_id: dbData.customer_profile_id,
            p_metadata: dbData.metadata || {}
          });

          if (error) throw error;

          // Success: Mark as done and REMOVE from processing list
          await updateIdempotencyStatus(idempotencyKey, `done:${orderId}`);
          await redis.lrem(keys.processingQueue, 1, JSON.stringify(orderData));
          totalProcessed++;

        } catch (err: any) {
          console.error(`[Worker] Failed Order ${idempotencyKey}:`, err.message);
          
          // Retry Logic (Max 3)
          if (!orderData.retries || orderData.retries < 3) {
            const retryData = { ...orderData, retries: (orderData.retries || 0) + 1 };
            await redis.lpush(keys.orderQueue, JSON.stringify(retryData));
          } else {
            // Move to Dead Letter Queue after 3 failures
            await redis.lpush('order_dlq', JSON.stringify({ ...orderData, error: err.message }));
            await updateIdempotencyStatus(idempotencyKey, 'failed');
          }
          // Remove from processing list (it's now in main queue or DLQ)
          await redis.lrem(keys.processingQueue, 1, JSON.stringify(orderData));
          totalFailed++;
        }
      }));

      // Vercel Log monitoring
      if (totalProcessed % 40 === 0) {
        const queueSize = await redis.llen(keys.orderQueue);
        console.log(`[Worker] Progress: ${totalProcessed} processed. Remaining: ${queueSize}`);
      }
    }

  } catch (err: any) {
    console.error('[Worker] Fatal error in main loop:', err.message);
  }

  return NextResponse.json({
    status: 'Finished',
    processed: totalProcessed,
    failed: totalFailed,
    queueRemaining: await redis.llen(keys.orderQueue),
    runtime: `${(Date.now() - startTime) / 1000}s`
  });
}

// Support POST if needed manually
export async function POST(req: Request) { return GET(req); }
