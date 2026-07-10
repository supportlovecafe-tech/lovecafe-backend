const http = require('http');

const cinemaId = 'f115ebed-c919-4fd2-850a-f0deb0753936'; // Atindra ID

http.get(`http://localhost:3000/api/menu?cinemaId=${cinemaId}`, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log("Next.js /api/menu API response:");
      if (Array.isArray(parsed)) {
        parsed.forEach(item => {
          console.log(`- Food: ${item.name} | ID: ${item.id} | Category: ${item.category} | Available: ${item.is_available}`);
        });
      } else {
        console.log(parsed);
      }
    } catch (e) {
      console.error("Failed to parse JSON response:", e.message);
      console.log("Raw response:", data);
    }
  });
}).on('error', (err) => {
  console.error("Error calling API:", err.message);
});
