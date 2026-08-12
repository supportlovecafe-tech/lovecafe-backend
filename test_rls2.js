require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testUpdate() {
  const { data, error } = await supabase.from('screens').select('id, name').limit(1);
  if (error) {
    console.error('Select Error:', error);
    return;
  }
  if (!data || data.length === 0) {
    console.log('No screens found');
    return;
  }
  
  const screenId = data[0].id;
  const oldName = data[0].name;
  console.log('Attempting to update screen:', screenId, 'from', oldName);
  
  const { data: updateData, error: updateError } = await supabase
    .from('screens')
    .update({ name: oldName + ' test' })
    .eq('id', screenId)
    .select();
    
  if (updateError) {
    console.error('Update Error:', updateError);
  } else {
    console.log('Update Data:', updateData);
  }
}

testUpdate();
