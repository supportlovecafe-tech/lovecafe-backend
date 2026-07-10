import { NextResponse } from 'next/server';
import { getCachedMenu, getCachedCombos } from '@/lib/menu-service';
import { isRateLimited } from '@/lib/redis';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const cinemaId = searchParams.get('cinemaId');
    const ip = req.headers.get('x-forwarded-for') || 'anonymous';

    if (!cinemaId) {
      return NextResponse.json({ error: 'Missing cinemaId' }, { status: 400 });
    }

    // Rate Limit: 30 requests per minute
    if (await isRateLimited(`menu:rate:${ip}`, 30, 60)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const [menu, combos] = await Promise.all([
      getCachedMenu(cinemaId),
      getCachedCombos(cinemaId)
    ]);

    const mappedCombos = (combos || []).map(c => ({
        ...c,
        is_combo: true,
        category: '🔥 Combos'
    }));

    const fullMenu = [...mappedCombos, ...(menu || [])];

    return NextResponse.json(fullMenu, { 
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
      }
    });
  } catch (error) {
    console.error('API Menu Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
