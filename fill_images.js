require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const imageMap = {
  'PIZZA': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop',
  'POPCORN': 'https://images.unsplash.com/photo-1578849278619-e73505e9610f?w=600&auto=format&fit=crop',
  'BURGER': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop',
  'SNACKS': 'https://images.unsplash.com/photo-1562967914-608f82629710?w=600&auto=format&fit=crop',
  'SANDWICH': 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=600&auto=format&fit=crop',
  'BEVERAGES': 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=600&auto=format&fit=crop',
  'ICE_CREAM': 'https://images.unsplash.com/photo-1570197781417-0a8237582c3c?w=600&auto=format&fit=crop',
  'MILKSHAKE': 'https://images.unsplash.com/photo-1572490122747-3968b75bb811?w=600&auto=format&fit=crop',
  'LASSI': 'https://images.unsplash.com/photo-1595981267035-7b04d84b4f1e?w=600&auto=format&fit=crop',
  'FUSION_FOODS': 'https://images.unsplash.com/photo-1555126634-ae235c4bc47a?w=600&auto=format&fit=crop',
  'LOVE_SPECIAL': 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=600&auto=format&fit=crop',
  'MOMOS': 'https://images.unsplash.com/photo-1625220194771-7ebdea0b70b9?w=600&auto=format&fit=crop',
  'DEFAULT': 'https://images.unsplash.com/photo-1541167760496-162955ed8a9f?w=600&auto=format&fit=crop'
};

async function updateImages() {
  const { data, error } = await supabase.from('food_items').select('id, name, category, image_url');
  if (error) {
    console.error('Error fetching items:', error);
    return;
  }

  let updatedCount = 0;
  
  for (const item of data) {
    if (!item.image_url || item.image_url.trim() === '') {
      const defaultImage = imageMap[item.category] || imageMap['DEFAULT'];
      
      const { error: updateError } = await supabase
        .from('food_items')
        .update({ image_url: defaultImage })
        .eq('id', item.id);
        
      if (updateError) {
        console.error(`Failed to update ${item.name}:`, updateError);
      } else {
        updatedCount++;
        console.log(`Updated [${item.category}] ${item.name}`);
      }
    }
  }
  
  console.log(`\nSuccessfully assigned images to ${updatedCount} items!`);
}

updateImages();
