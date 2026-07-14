import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { renderToStream } from '@react-pdf/renderer';
import React from 'react';
import InvoiceDocument from '@/components/InvoiceDocument';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    let id = url.searchParams.get('id');

    // If there is no 'id=' parameter, try to take the raw query string (e.g. ?ORD12345)
    if (!id && url.search.length > 1) {
      id = url.search.substring(1);
    }
    
    // Next.js normalizes valueless query params by adding an '=' at the end (e.g. ?OUTLET-8457 becomes ?OUTLET-8457=)
    if (id && id.endsWith('=')) {
      id = id.slice(0, -1);
    }

    if (!id) {
      return new NextResponse('Missing order ID parameter', { status: 400 });
    }
    
    // We expect `id` to be the `display_id` or `id` (whichever is shorter)
    console.log('[Billing API] ID extracted:', id);
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

    // Render the PDF to a stream
    const pdfStream = await renderToStream(
      <InvoiceDocument order={order} items={items} customer={order.customer_profiles} />
    );

    // Convert React PDF stream to Web Response stream
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
