

async function testAPI() {
  const url = 'https://admin.lovecafe.org.in/api/orders/create';
  // I need a valid cinema_id from the DB
  const payload = {
    cinema_id: "00000000-0000-0000-0000-000000000000", // Will likely fail with 500 or foreign key violation
    items: [],
    total_amount: 100,
    customer_phone: "8017683428",
    location: "Screen 8 - Seat u8",
    payment_method: "POS_CASH"
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-idempotency-key': 'test-key-1234',
        'User-Agent': 'Dart/3.0 (dart:io)'
      },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Response:", text);
  } catch (e) {
    console.error("Fetch failed:", e);
  }
}

testAPI();
