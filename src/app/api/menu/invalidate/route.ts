import { NextResponse } from 'next/server';
import { invalidateMenuCache } from '@/lib/menu-service';
import { createClient } from '@/lib/supabase/server';

/**
 * Endpoint to manually invalidate menu cache
 * Called by Admin POS when an item is updated/deleted.
 */
export async function POST(req: Request) {
  try {
    let cinemaId: string | null = null;
    const url = new URL(req.url);
    const queryCinemaId = url.searchParams.get('cinemaId');
    
    if (queryCinemaId) {
      cinemaId = queryCinemaId;
    } else {
      try {
        const body = await req.json();
        cinemaId = body?.cinemaId || null;
      } catch {
        // Body was empty or not JSON
      }
    }

    await invalidateMenuCache(cinemaId || 'ALL');
    
    return NextResponse.json({ success: true, message: 'Cache invalidated', cinemaId: cinemaId || 'ALL' });
  } catch (error) {
    console.error('Cache Invalidation Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
