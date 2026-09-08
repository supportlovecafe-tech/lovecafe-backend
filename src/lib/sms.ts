export async function sendSMS(phone: string, otp: string) {
  const baseUrl = process.env.JIO_BASE_URL;
  const username = process.env.JIO_USERNAME;
  const password = process.env.JIO_PASSWORD;
  const templateId = process.env.JIOCX_OTP_TEMPLATE_ID || '1277178842080455698';
  const senderId = process.env.JIOCX_SENDER_ID;
  const entityId = process.env.JIOCX_ENTITY_ID;

  if (!baseUrl || !username || !password || !templateId || !senderId || !entityId) {
    console.error('JioCX configuration missing');
    throw new Error('SMS service configuration error');
  }

  // Clean up phone number and ensure it starts with 91 for Jio API
  let sanitizedPhone = phone.replace(/\D/g, '');
  if (sanitizedPhone.length === 10) {
    sanitizedPhone = '91' + sanitizedPhone;
  } else if (sanitizedPhone.length > 10 && !sanitizedPhone.startsWith('91')) {
    sanitizedPhone = '91' + sanitizedPhone.slice(-10);
  }

  // Match the DLT Template ID: 1277178842080455698
  const messageText = `Your LoveCafe a unit of LUV OTP is ${otp}. Do not share it with anyone.`;

  const payload = {
    username: username,
    password: password,
    sender_id: senderId,
    to: sanitizedPhone,
    sms_type: "T", // T for Transactional (or OTP)
    sms_content_type: "Static",
    body: messageText,
    dlt_template_id: templateId,
    dlt_entity_id: entityId
  };

  const sendResponse = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    },
    body: JSON.stringify(payload)
  });

  const sendText = await sendResponse.text();
  let sendData;
  try {
    sendData = JSON.parse(sendText);
  } catch (e) {
    console.error('JioCX Send Response was not JSON:', sendText);
    throw new Error(`JioCX API returned an invalid response (Status: ${sendResponse.status})`);
  }
  
  if (!sendResponse.ok) {
    console.error('JioCX Send Error:', sendData);
    throw new Error(sendData.message || 'Failed to send SMS via JioCX');
  }

  // LOG THE EXACT JIO RESPONSE FOR DEBUGGING DLT SILENT DROPS
  console.log('[JioCX API Full Response]:', JSON.stringify(sendData));

  return sendData;
}
