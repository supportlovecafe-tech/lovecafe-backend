import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { renderToStream } from '@react-pdf/renderer';
import React from 'react';
import InvoiceDocument from '@/components/InvoiceDocument';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // We expect `id` to be the `display_id` or `id` (whichever is shorter)
    const supabase = await createClient();
    const { data: order, error } = await supabase
      .from('orders')
      .select('*, customer_profiles(*)')
      .or(`display_id.eq.${id},id.eq.${id}`)
      .single();

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
