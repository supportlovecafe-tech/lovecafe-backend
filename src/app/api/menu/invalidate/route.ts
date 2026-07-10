import { NextResponse } from 'next/server';
import { invalidateMenuCache } from '@/lib/menu-service';
import { createClient } from '@/lib/supabase/server';

/**
 * Endpoint to manually invalidate menu cache
 * Called by Admin POS when an item is updated/deleted.
 */
export async function POST(req: Request) {
  try {
    const { cinemaId } = await req.json();
    const supabase = await createClient();

    if (!cinemaId) {
        return NextResponse.json({ error: 'Missing cinemaId' }, { status: 400 });
    }

    // Verify Admin Authorization (Optional but recommended)
    // For now, we trust the caller, but ideally check JWT role

    await invalidateMenuCache(cinemaId);
    
    return NextResponse.json({ success: true, message: 'Cache invalidated' });
  } catch (error) {
    console.error('Cache Invalidation Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
