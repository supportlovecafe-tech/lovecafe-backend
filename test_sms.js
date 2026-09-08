const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables
const envConfig = dotenv.parse(fs.readFileSync('.env'));
for (const k in envConfig) {
  process.env[k] = envConfig[k];
}

async function testSMS() {
  const baseUrl = process.env.JIO_BASE_URL;
  const username = process.env.JIO_USERNAME;
  const password = process.env.JIO_PASSWORD;
  const otpTemplateId = process.env.JIOCX_OTP_TEMPLATE_ID;
  const billTemplateId = process.env.JIOCX_BILL_TEMPLATE_ID;
  const senderId = process.env.JIOCX_SENDER_ID;
  const entityId = process.env.JIOCX_ENTITY_ID;

  const phone = '8017683428';
  const otp = '123456';
  const rupees = '234';
  const paise = '67';
  const billUrl = 'https://admin.lovecafe.org.in/b?A123456';
  
  const sanitizedPhone = '91' + phone;

  console.log("--- Testing OTP SMS ---");
  const otpMessage = `Your LoveCafe a unit of LUV OTP is ${otp}. Do not share it with anyone.`;
  await sendJioSms(baseUrl, username, password, senderId, entityId, otpTemplateId, sanitizedPhone, otpMessage);

  console.log("\n--- Testing Billing SMS ---");
  const billMessage = `Dear customer, your LOVECAFE Order of Amount: Rs. ${rupees}. ${paise}  is confirmed. Bill: ${billUrl}  Thank you & visit again.`;
  await sendJioSms(baseUrl, username, password, senderId, entityId, billTemplateId, sanitizedPhone, billMessage);
}

async function sendJioSms(baseUrl, username, password, senderId, entityId, templateId, toPhone, messageText) {
  const payload = {
    username: username,
    password: password,
    sender_id: senderId,
    to: toPhone,
    sms_type: "T",
    sms_content_type: "Static",
    body: messageText,
    dlt_template_id: templateId,
    dlt_entity_id: entityId
  };

  console.log("Payload:", JSON.stringify(payload, null, 2));

  try {
    const sendResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const sendText = await sendResponse.text();
    console.log("Status:", sendResponse.status);
    console.log("Response Text:", sendText);
  } catch (e) {
    console.error("Error:", e);
  }
}

testSMS();
