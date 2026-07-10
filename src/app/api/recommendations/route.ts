import { NextResponse } from 'next/server';
import { getCachedRecommendations } from '@/lib/recommendation-service';
import { isRateLimited } from '@/lib/redis';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const cinemaId = searchParams.get('cinemaId');
    const userId = searchParams.get('userId');
    const phone = searchParams.get('phone');
    const ip = req.headers.get('x-forwarded-for') || 'anonymous';

    if (!cinemaId || !userId || !phone) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    if (await isRateLimited(`recs:rate:${ip}`, 20, 60)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const recs = await getCachedRecommendations(cinemaId, userId, phone);
    return NextResponse.json(recs, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
