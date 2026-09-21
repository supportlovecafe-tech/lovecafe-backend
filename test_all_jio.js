const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('.env'));
for (const k in envConfig) {
  process.env[k] = envConfig[k];
}

async function testMethods() {
  const username = process.env.JIO_USERNAME;
  const password = process.env.JIO_PASSWORD;
  const senderId = process.env.JIOCX_SENDER_ID;
  const entityId = process.env.JIOCX_ENTITY_ID;
  const templateId = process.env.JIOCX_OTP_TEMPLATE_ID;

  const phone = '918017683428';
  const body = 'Your LoveCafe a unit of LUV OTP is 123456. Do not share it with anyone.';

  const baseUrl = process.env.JIO_BASE_URL;

  console.log("=== TEST 1: GET Query Parameters ===");
  try {
    const params = new URLSearchParams({
      username,
      password,
      sender_id: senderId,
      to: phone,
      sms_type: "T",
      sms_content_type: "Static",
      body,
      dlt_template_id: templateId,
      dlt_entity_id: entityId
    });
    const urlWithParams = `${baseUrl}?${params.toString()}`;
    console.log("GET URL:", urlWithParams);
    const getRes = await fetch(urlWithParams, { method: 'GET' });
    console.log("GET Status:", getRes.status);
    console.log("GET Response:", await getRes.text());
  } catch (e) {
    console.error("GET Error:", e.message);
  }

  console.log("\n=== TEST 2: POST Form Urlencoded ===");
  try {
    const params = new URLSearchParams({
      username,
      password,
      sender_id: senderId,
      to: phone,
      sms_type: "T",
      sms_content_type: "Static",
      body,
      dlt_template_id: templateId,
      dlt_entity_id: entityId
    });
    const postRes = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    console.log("Form Status:", postRes.status);
    console.log("Form Response:", await postRes.text());
  } catch (e) {
    console.error("Form Error:", e.message);
  }

  console.log("\n=== TEST 3: POST JSON with standard headers ===");
  try {
    const postRes = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      },
      body: JSON.stringify({
        username,
        password,
        sender_id: senderId,
        to: phone,
        sms_type: "T",
        sms_content_type: "Static",
        body,
        dlt_template_id: templateId,
        dlt_entity_id: entityId
      })
    });
    console.log("JSON Status:", postRes.status);
    console.log("JSON Response:", await postRes.text());
  } catch (e) {
    console.error("JSON Error:", e.message);
  }
}

testMethods();
