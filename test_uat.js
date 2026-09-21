const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('.env'));
for (const k in envConfig) {
  process.env[k] = envConfig[k];
}

async function testUat() {
  const uatUrl = 'https://jiocxuat.jiocx.com/apggw/luv/sms/v1/send';
  const username = process.env.JIO_USERNAME;
  const password = process.env.JIO_PASSWORD;
  const otpTemplateId = process.env.JIOCX_OTP_TEMPLATE_ID;
  const senderId = process.env.JIOCX_SENDER_ID;
  const entityId = process.env.JIOCX_ENTITY_ID;

  const phone = '918017683428';
  const otpMessage = `Your LoveCafe a unit of LUV OTP is 123456. Do not share it with anyone.`;

  const payload = {
    username,
    password,
    sender_id: senderId,
    to: phone,
    sms_type: "T",
    sms_content_type: "Static",
    body: otpMessage,
    dlt_template_id: otpTemplateId,
    dlt_entity_id: entityId
  };

  console.log("Testing UAT URL:", uatUrl);
  try {
    const res = await fetch(uatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response:", text);
  } catch (e) {
    console.error("Error:", e.message);
  }
}

testUat();
