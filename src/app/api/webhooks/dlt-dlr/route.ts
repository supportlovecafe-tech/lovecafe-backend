import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  return handleWebhook(req);
}

export async function GET(req: NextRequest) {
  return handleWebhook(req);
}

async function handleWebhook(req: NextRequest) {
  try {
    let payload: any = {};
    
    // Parse query params (often used by DLT DLRs)
    const { searchParams } = new URL(req.url);
    searchParams.forEach((value, key) => {
      payload[key] = value;
    });

    // Try to parse body if it's a POST
    if (req.method === 'POST') {
      try {
        const text = await req.text();
        if (text) {
          try {
            const json = JSON.parse(text);
            payload = { ...payload, ...json };
          } catch {
             // If not JSON, try to parse as form data
             const params = new URLSearchParams(text);
             params.forEach((value, key) => {
               payload[key] = value;
             });
          }
        }
      } catch (e) {
        // Ignore body parsing errors
      }
    }

    // Extract common fields (field names vary by provider, so check common ones)
    const mobile_number = payload.mobile || payload.dest || payload.msisdn || payload.to || null;
    const status = payload.status || payload.stat || payload.dlrStatus || null;
    const message_id = payload.msgid || payload.messageId || payload.id || null;

    console.log('[DLT DLR Webhook] Received payload:', payload);

    // Save to database
    const { error } = await supabaseAdmin.from('sms_logs').insert([{
      mobile_number: mobile_number?.toString(),
      status: status?.toString(),
      message_id: message_id?.toString(),
      raw_payload: payload
    }]);

    if (error) {
      console.error('[DLT DLR Webhook] Supabase Insert Error:', error);
    }

    // Always return 200 OK so the provider knows we received it
    return NextResponse.json({ success: true, message: 'DLR received' });
  } catch (error: any) {
    console.error('[DLT DLR Webhook] Fatal Error:', error);
    // Still return 200 so the provider doesn't keep retrying if it's an internal error
    return NextResponse.json({ success: true, warning: 'Internal processing error' });
  }
}
