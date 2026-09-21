const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('.env'));
for (const k in envConfig) {
  process.env[k] = envConfig[k];
}

async function debugJio() {
  const username = process.env.JIO_USERNAME;
  const password = process.env.JIO_PASSWORD;
  const senderId = process.env.JIOCX_SENDER_ID;
  const entityId = process.env.JIOCX_ENTITY_ID;
  const otpTemplateId = process.env.JIOCX_OTP_TEMPLATE_ID;

  const payload = {
    username,
    password,
    sender_id: senderId,
    to: '918017683428',
    sms_type: "T",
    sms_content_type: "Static",
    body: "Your LoveCafe a unit of LUV OTP is 123456. Do not share it with anyone.",
    dlt_template_id: otpTemplateId,
    dlt_entity_id: entityId
  };

  const urlsToTest = [
    'https://smsapi.jiocx.com/apggw/luv/sms/v1/send',
    'https://jiocxuat.jiocx.com/apggw/luv/sms/v1/send',
    'https://smsapi.jiocx.com/sms/v1/send',
    'https://jiocx.com/apggw/luv/sms/v1/send',
    'http://smsapi.jiocx.com/apggw/luv/sms/v1/send'
  ];

  for (const url of urlsToTest) {
    console.log(`\n========================================`);
    console.log(`Testing URL: ${url}`);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify(payload)
      });
      console.log(`Status: ${res.status} ${res.statusText}`);
      const text = await res.text();
      console.log(`Response snippet: ${text.substring(0, 300)}`);
    } catch (e) {
      console.error(`Error: ${e.message}`);
    }
  }
}

debugJio();
