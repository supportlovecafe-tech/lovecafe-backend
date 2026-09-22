import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { renderToStream } from '@react-pdf/renderer';
import React from 'react';
import InvoiceDocument from '@/components/InvoiceDocument';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // We expect `id` to be the `display_id` or `id` (whichever is shorter)
    const supabase = await createAdminClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    let query = supabase.from('orders').select('*, customer_profiles(*)');
    if (isUuid) {
      query = query.eq('id', id);
    } else {
      query = query.eq('display_id', id);
    }

    const { data: order, error } = await query.single();

    if (error || !order) {
      console.error('[Billing API] Order not found:', error);
      return new NextResponse('Order not found', { status: 404 });
    }

    // Parse items if they are stored as JSON
    const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items as string || '[]');

    // Enrich items with latest DB names and apply_gst
    const foodIds = items.map((i: any) => i.food_id || i.id).filter(Boolean);
    if (foodIds.length > 0) {
      try {
        const { data: dbFoods } = await supabase
          .from('food_items')
          .select('id, name, apply_gst')
          .in('id', foodIds);

        if (dbFoods && dbFoods.length > 0) {
          const foodMap = new Map<string, any>(dbFoods.map((f: any) => [f.id, f]));
          items.forEach((item: any) => {
            const dbFood: any = foodMap.get(item.food_id || item.id);
            if (dbFood) {
              if (!item.food_name && !item.name) item.food_name = dbFood.name;
              if (item.apply_gst === undefined && item.applyGst === undefined) {
                item.apply_gst = dbFood.apply_gst;
              }
            }
          });
        }
      } catch (enrichErr) {
        console.warn('[Billing API] Could not enrich items from food_items table:', enrichErr);
      }
    }

    // Check global enable_gst setting
    let enableGst = true;
    try {
      const { data: feeSettings } = await supabase
        .from('global_settings')
        .select('value')
        .eq('key', 'platform_fees')
        .single();
      if (feeSettings?.value) {
        const val = feeSettings.value as any;
        if (val.enable_gst !== undefined) enableGst = Boolean(val.enable_gst);
        else if (val.enable_cgst_sgst !== undefined) enableGst = Boolean(val.enable_cgst_sgst);
      }
    } catch (e) {}

    // Render the PDF to a stream
    const pdfStream = await renderToStream(
      <InvoiceDocument order={order} items={items} customer={order.customer_profiles} enableGst={enableGst} />
    );

    // Convert React PDF stream to Web Response stream
    // Using a readable stream to pipe data
    const readableStream = new ReadableStream({
      start(controller) {
        pdfStream.on('data', (chunk) => controller.enqueue(chunk));
        pdfStream.on('end', () => controller.close());
        pdfStream.on('error', (err) => controller.error(err));
      }
    });

    return new NextResponse(readableStream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Invoice-${order.display_id || order.id}.pdf"`,
      },
    });

  } catch (error) {
    console.error('[Billing API] Error generating PDF:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
