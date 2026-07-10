import React from 'react';
import { renderToFile } from '@react-pdf/renderer';
import InvoiceDocument from './src/components/InvoiceDocument';
import path from 'path';
import fs from 'fs';

// Mock order data
const mockOrder = {
  id: 'e4b9f2c8-7a1b-4d3e-9f0a-1c2d3e4f5a6b',
  display_id: 'ORD-98765',
  timestamp: new Date().toISOString(),
  total_amount: 1050.50,
  customer_phone: '9876543210'
};

const mockCustomer = {
  first_name: 'Anirban',
  last_name: 'Roy',
  email: 'anirban@example.com'
};

const mockItems = [
  { name: 'Popcorn Tub (Large)', quantity: 2, food_price: 250, total: 500 },
  { name: 'Coke (Medium)', quantity: 2, food_price: 150, total: 300 },
  { name: 'Nachos with Cheese', quantity: 1, food_price: 250.50, total: 250.50 }
];

async function generateSample() {
  const outputPath = 'C:/Users/anirb/.gemini/antigravity-ide/brain/79471495-652a-4340-b794-8164d89d482e/scratch/sample_invoice.pdf';
  
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  console.log('Generating sample PDF...');
  
  await renderToFile(
    <InvoiceDocument order={mockOrder} items={mockItems} customer={mockCustomer} />,
    outputPath
  );
  
  console.log('PDF generated at:', outputPath);
}

generateSample().catch(console.error);
