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
  const templateId = process.env.JIOCX_OTP_TEMPLATE_ID;
  const senderId = process.env.JIOCX_SENDER_ID;
  const entityId = process.env.JIOCX_ENTITY_ID;

  const phone = '9999999999';
  const otp = '123456';
  
  const sanitizedPhone = '91' + phone;
  const messageText = `Your LoveCafe OTP is ${otp}. Do not share it with anyone.`;

  const payload = {
    username: username,
    password: password,
    sender_id: senderId,
    to: sanitizedPhone,
    sms_type: "T",
    sms_content_type: "Static",
    body: messageText,
    dlt_template_id: templateId,
    dlt_entity_id: entityId
  };

  console.log("Sending payload:", payload);

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
