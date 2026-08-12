require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testUpdate() {
  const { data, error } = await supabase.from('cinemas').select('id, name').limit(1);
  if (error) {
    console.error('Select Error:', error);
    return;
  }
  if (!data || data.length === 0) {
    console.log('No cinemas found');
    return;
  }
  
  const cinemaId = data[0].id;
  const oldName = data[0].name;
  console.log('Attempting to update cinema:', cinemaId, 'from', oldName);
  
  const { data: updateData, error: updateError } = await supabase
    .from('cinemas')
    .update({ name: oldName + ' test' })
    .eq('id', cinemaId)
    .select();
    
  if (updateError) {
    console.error('Update Error:', updateError);
  } else {
    console.log('Update Data:', updateData);
  }
  
  // Revert back
  if (updateData && updateData.length > 0) {
    await supabase.from('cinemas').update({ name: oldName }).eq('id', cinemaId);
  }
}

testUpdate();
