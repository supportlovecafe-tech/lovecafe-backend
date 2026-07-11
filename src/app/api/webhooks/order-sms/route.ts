import { NextResponse } from 'next/server';

const JIO_API_URL = process.env.JIO_BASE_URL || ''; 
const JIO_SENDER_ID = process.env.JIOCX_SENDER_ID || '';
const JIO_TEMPLATE_ID = process.env.JIOCX_BILL_TEMPLATE_ID || '';
const JIO_ENTITY_ID = process.env.JIOCX_ENTITY_ID || '';
const JIO_USERNAME = process.env.JIO_USERNAME || '';
const JIO_PASSWORD = process.env.JIO_PASSWORD || '';

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    // Supabase Webhook payload structure: { type: 'INSERT', record: { ... }, ... }
    const order = payload.record;

    if (!order) {
      return NextResponse.json({ error: 'No record found in webhook payload' }, { status: 400 });
    }

    const customerPhone = order.customer_phone;
    if (!customerPhone) {
      return NextResponse.json({ error: 'Customer phone not found for this order' }, { status: 400 });
    }

    // Parse Amount into Rupees and Paise
    const amountStr = (order.total_amount || 0).toString();
    let rupees = amountStr;
    let paise = '00';
    if (amountStr.includes('.')) {
      const parts = amountStr.split('.');
      rupees = parts[0];
      paise = parts[1].padEnd(2, '0').substring(0, 2);
    }

    const orderId = order.display_id || 'Unknown';
    const billUrl = `https://admin.lovecafe.org.in/b?${orderId}`;

    // Exactly matching the approved JioCX DLT Template
    const messageText = `Dear customer, your LOVECAFE Order of Amount: Rs.${rupees}. ${paise} is confirmed\nBill: ${billUrl}\nThank you & visit again.`;

    console.log(`\n========================================`);
    console.log(`[DLT SMS TRIGGER] To: ${customerPhone}`);
    console.log(`Template Msg: \n${messageText}`);
    console.log(`========================================\n`);

    // If credentials are not set, we just mock the request and exit early
    if (!JIO_SENDER_ID || !JIO_USERNAME) {
      console.log('Jio credentials not fully configured in .env. Mock SMS generated.');
      return NextResponse.json({ success: true, message: 'Mock SMS logged. Configure JIO_ variables to send.' });
    }

    // Clean up phone number and ensure it starts with 91 for Jio API
    let sanitizedPhone = customerPhone.replace(/\D/g, '');
    if (sanitizedPhone.length === 10) {
      sanitizedPhone = '91' + sanitizedPhone;
    } else if (sanitizedPhone.length > 10 && !sanitizedPhone.startsWith('91')) {
      sanitizedPhone = '91' + sanitizedPhone.slice(-10);
    }

    // Prepare JSON payload for Jio POST API
    const smsPayload = {
      username: JIO_USERNAME,
      password: JIO_PASSWORD,
      sender_id: JIO_SENDER_ID,
      to: sanitizedPhone,
      sms_type: "T",
      sms_content_type: "Static",
      dlt_template_id: JIO_TEMPLATE_ID,
      body: messageText,
      dlt_entity_id: JIO_ENTITY_ID
    };

    const smsResponse = await fetch(JIO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(smsPayload)
    });

    const smsResultText = await smsResponse.text();
    console.log('[Jio Response]:', smsResultText);

    if (!smsResponse.ok) {
      console.error('Failed to send SMS via Jio:', smsResultText);
      return NextResponse.json({ error: 'Failed to send SMS through provider' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'SMS Triggered via Webhook',
      jioResponse: smsResultText 
    });

  } catch (error) {
    console.error('Webhook processing Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
