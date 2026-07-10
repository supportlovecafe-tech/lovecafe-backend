const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

try {
  const envPath = path.join(__dirname, '.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      process.env[key] = val;
    }
  });
} catch (e) {
  console.warn("Could not read .env file directly", e.message);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://pwbvoosqunrvqewokynz.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function runValidation() {
  console.log("=== STARTING INVENTORY FLOW VALIDATION ===");
  const cinemaId = 'f115ebed-c919-4fd2-850a-f0deb0753936'; // Atindra
  const foodItemId = 'dd91fd5b-a5f0-4dc9-af05-0417908d115b'; // Popcorn Salted (Medium)

  // 1. Clean up existing test inventory items
  console.log("1. Cleaning up existing test inventory items...");
  await supabase.from('inventory_items').delete().eq('cinema_id', cinemaId).eq('sku', 'PK-TEST-KG');

  // 2. Insert test inventory item
  console.log("2. Inserting inventory item 'Popcorn Kernels (kg)' with stock 10.0...");
  const { data: invItem, error: invErr } = await supabase.from('inventory_items').insert({
    cinema_id: cinemaId,
    item_name: 'Popcorn Kernels (kg)',
    sku: 'PK-TEST-KG',
    stock_quantity: 10.0,
    unit: 'kg',
    min_stock_level: 2.0
  }).select().single();

  if (invErr) {
    console.error("Error inserting inventory item:", invErr);
    process.exit(1);
  }
  console.log(`   Success: Item ID is ${invItem.id}`);

  // 3. Create mapping
  console.log("3. Mapping Popcorn Salted (Medium) -> 0.25 kg of Popcorn Kernels...");
  const { data: mapping, error: mapErr } = await supabase.from('product_inventory_mappings').insert({
    cinema_id: cinemaId,
    food_item_id: foodItemId,
    inventory_item_id: invItem.id,
    quantity_needed: 0.25
  }).select().single();

  if (mapErr) {
    console.error("Error creating mapping:", mapErr);
    process.exit(1);
  }
  console.log(`   Success: Mapping ID is ${mapping.id}`);

  // 4. Insert order (which should trigger stock deduction)
  console.log("4. Simulating order placement: 2x Popcorn Salted (Medium)...");
  const orderItems = [
    {
      id: foodItemId,
      name: 'Popcorn Salted (Medium)',
      quantity: 2,
      is_combo: false
    }
  ];

  const { data: orderId, error: orderErr } = await supabase.rpc('place_order_secure', {
    p_cinema_id: cinemaId,
    p_display_id: 'TX-INV-100',
    p_items: orderItems,
    p_total_amount: 500.0,
    p_location: 'Seat A1',
    p_customer_phone: '9999999999',
    p_payment_method: 'CASH'
  });

  if (orderErr) {
    console.error("Error placing order:", orderErr);
    process.exit(1);
  }
  console.log(`   Success: Order ID is ${orderId}`);

  // 5. Query inventory item to verify new stock
  console.log("5. Querying new stock level of 'Popcorn Kernels (kg)'...");
  const { data: updatedInv, error: readErr } = await supabase.from('inventory_items').select('*').eq('id', invItem.id).single();
  if (readErr) {
    console.error("Error reading updated inventory:", readErr);
    process.exit(1);
  }

  console.log(`   Initial stock: 10.0 kg`);
  console.log(`   Expected stock: 9.5 kg (10.0 - 2 * 0.25)`);
  console.log(`   Actual stock in database: ${updatedInv.stock_quantity} kg`);

  // 6. Query transactions log
  console.log("6. Verifying transactions log...");
  const { data: txs, error: txErr } = await supabase.from('inventory_transactions').select('*').eq('order_id', orderId);
  if (txErr) {
    console.error("Error reading transaction logs:", txErr);
    process.exit(1);
  }

  console.log(`   Logs found for order: ${txs.length}`);
  txs.forEach(t => {
    console.log(`   - Log ID: ${t.id}`);
    console.log(`     Quantity changed: ${t.quantity_changed} ${updatedInv.unit}`);
    console.log(`     Type: ${t.transaction_type}`);
    console.log(`     Description: "${t.description}"`);
  });

  if (updatedInv.stock_quantity === 9.5 && txs.length === 1 && txs[0].quantity_changed === -0.5) {
    console.log("\n=== VALIDATION COMPLETED SUCCESSFULLY! ===");
  } else {
    console.error("\n=== VALIDATION FAILED: Stock level or transaction log mismatch! ===");
    process.exit(1);
  }
}

runValidation();
