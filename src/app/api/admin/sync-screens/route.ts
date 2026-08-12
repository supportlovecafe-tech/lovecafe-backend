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
    const { cinemaId, screensToInsert, screensToUpdate, screensToRemove } = await req.json();

    if (!cinemaId) {
      return NextResponse.json({ error: 'cinemaId is required' }, { status: 400, headers: corsHeaders });
    }

    if (screensToInsert?.length > 0) {
      const { error } = await supabaseAdmin.from('screens').insert(screensToInsert);
      if (error) throw error;
    }

    if (screensToUpdate?.length > 0) {
      for (const screen of screensToUpdate) {
        const { error } = await supabaseAdmin.from('screens')
          .update({ name: screen.name, tag: screen.tag })
          .eq('id', screen.id);
        if (error) throw error;
      }
    }

    if (screensToRemove?.length > 0) {
      const { error } = await supabaseAdmin.from('screens').delete().in('id', screensToRemove);
      if (error) throw error;
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders });

  } catch (error: any) {
    console.error('[API] Error in sync-screens:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}
