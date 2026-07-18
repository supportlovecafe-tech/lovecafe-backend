async function testValidate() {
  const url = 'https://admin.lovecafe.org.in/api/orders/validate';
  // Let's mimic what the POS sends
  const payload = {
    items: [
      {
        id: "a1cd73d1-4be0-449b-b0b9-5dc79d201a4f", // Mock ID, maybe use actual from DB if you can
        name: "Crispy Corn",
        price: 150,
        quantity: 1,
        is_combo: false
      }
    ],
    is_pos: true
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0'
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

testValidate();
