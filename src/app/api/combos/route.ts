import { NextResponse } from 'next/server';
import { getCachedCombos } from '@/lib/menu-service';
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
    if (await isRateLimited(`combos:rate:${ip}`, 30, 60)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const combos = await getCachedCombos(cinemaId);

    const mappedCombos = (combos || []).map((c: any) => ({
      ...c,
      is_combo: true,
      category: '🔥 Combos'
    }));

    return NextResponse.json(mappedCombos, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
      }
    });
  } catch (error) {
    console.error('API Combos Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
