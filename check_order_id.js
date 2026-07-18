const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkOrder() {
  const id = 'outlet-8457';
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
  let query = supabase.from('orders').select('*, customer_profiles(*)');
  if (isUuid) {
    query = query.eq('id', id);
  } else {
    query = query.eq('display_id', id);
  }

  const { data, error } = await query.single();

  if (error) {
    console.error('Error fetching orders:', error);
  } else {
    console.log('Order retrieved successfully:', data.id, data.display_id);
  }
}

checkOrder();
