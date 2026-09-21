const fs = require('fs');
const jwt = require('jsonwebtoken');

// --- CONFIGURE THESE VALUES ---
const teamId = '86DR5MUJB2'; // e.g. '1A2B3C4D5E' (find in Apple Developer Account)
const keyId = '9GGA85F56A';
const clientId = 'in.org.lovecafe.customer'; // Your iOS App Bundle ID
const p8FilePath = './AuthKey_9GGA85F56A.p8'; // Path to your downloaded .p8 file
// ------------------------------

try {
  const privateKey = fs.readFileSync(p8FilePath, 'utf8');

  const token = jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    expiresIn: '180d',
    issuer: teamId,
    audience: 'https://appleid.apple.com',
    subject: clientId,
    keyid: keyId,
  });

  console.log('\n=== YOUR APPLE SECRET KEY (JWT) ===\n');
  console.log(token);
  console.log('\n===================================\n');
  console.log('Copy the above token and paste it into the "Secret Key" field in Supabase.\n');
} catch (error) {
  console.error('Error generating token:', error.message);
  if (error.code === 'ENOENT') {
    console.error(`\nPlease make sure the file ${p8FilePath} exists in this directory!`);
  }
}
