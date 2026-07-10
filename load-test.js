import http from 'k6/http';
import { check, sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  scenarios: {
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '30s', target: 100 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1000'],
  },
};

const BASE_URL = 'http://localhost:3000'; 

export default function () {
  const idempotencyKey = uuidv4();
  const phone = `+919${Math.floor(100000000 + Math.random() * 900000000)}`;
  
  const payload = JSON.stringify({
    cinema_id: 'f115ebed-c919-4fd2-850a-f0deb0753936',
    items: [
      { id: 'popcorn-01', name: 'Large Popcorn', price: 250, quantity: 1 },
      { id: 'coke-01', name: 'Coke 500ml', price: 120, quantity: 2 }
    ],
    total_amount: 490,
    customer_phone: phone,
    location: `Screen 4, Row H, Seat ${Math.floor(Math.random() * 30 + 1)}`
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'x-idempotency-key': idempotencyKey,
    },
  };

  const res = http.post(`${BASE_URL}/api/orders/create`, payload, params);

  check(res, {
    'is status 202': (r) => r.status === 202,
    'is status 200/202': (r) => r.status === 200 || r.status === 202,
  });

  sleep(Math.random() * 3 + 1); 
}
