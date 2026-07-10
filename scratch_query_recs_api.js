const http = require('http');

const cinemaId = 'f115ebed-c919-4fd2-850a-f0deb0753936'; // Atindra ID
const userId = 'GUEST'; // Default guest or current user ID
const phone = 'NA';

// Let's call recommendations API
// http://localhost:3000/api/recommendations?cinemaId=...&userId=...&phone=...
http.get(`http://localhost:3000/api/recommendations?cinemaId=${cinemaId}&userId=${userId}&phone=${phone}`, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log("Next.js /api/recommendations API response:");
      console.log(parsed);
    } catch (e) {
      console.error("Failed to parse JSON response:", e.message);
      console.log("Raw response:", data);
    }
  });
}).on('error', (err) => {
  console.error("Error calling API:", err.message);
});
