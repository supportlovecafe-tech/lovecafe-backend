require('dotenv').config({ path: '.env' });

async function getDLQ() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if (!url || !token) {
    console.error('Missing Upstash credentials');
    return;
  }
  
  // LRANGE order_dlq 0 -1
  const response = await fetch(`${url}/lrange/order_dlq/0/-1`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  
  const data = await response.json();
  if (data.result) {
    console.log(`Found ${data.result.length} items in DLQ.`);
    const errors = data.result.map(item => {
      try {
        return JSON.parse(item).error;
      } catch (e) {
        return 'Parse error';
      }
    });
    // Count unique errors
    const errorCounts = errors.reduce((acc, err) => {
      acc[err] = (acc[err] || 0) + 1;
      return acc;
    }, {});
    console.log('Errors in DLQ:', errorCounts);
    
    // Log the first item's details for context
    if (data.result.length > 0) {
      console.log('Sample item:', data.result[0]);
    }
  } else {
    console.log('No data or error:', data);
  }
}

getDLQ();
