import test from 'node:test';
import assert from 'node:assert/strict';
import pkg from './dist/payment-methods.js';
const { normalizePaymentMethod, CANONICAL_COD_METHOD } = pkg;

// ============================================================================
// PART 1: Unit Tests for normalizePaymentMethod
// Covers T1, T2, T3, T4, T5, T6
// ============================================================================

test('T1: Flutter actual COD value PAY_ON_DELIVERY is recognized as COD', () => {
  const result = normalizePaymentMethod('PAY_ON_DELIVERY');
  assert.equal(result.isValid, true);
  assert.equal(result.isCod, true);
  assert.equal(result.canonicalMethod, 'PAY_ON_DELIVERY');
});

test('T2: Legacy CASH value is recognized as COD and mapped to canonical method', () => {
  const result = normalizePaymentMethod('CASH');
  assert.equal(result.isValid, true);
  assert.equal(result.isCod, true);
  assert.equal(result.canonicalMethod, CANONICAL_COD_METHOD);
});

test('T2b: Alternate COD alias is recognized as COD and mapped to canonical method', () => {
  const result = normalizePaymentMethod('COD');
  assert.equal(result.isValid, true);
  assert.equal(result.isCod, true);
  assert.equal(result.canonicalMethod, CANONICAL_COD_METHOD);
});

test('T3: Supported COD values with different letter casing or whitespace are normalized', () => {
  const cases = [
    '  pay_on_delivery  ',
    'Pay_On_Delivery',
    ' cash ',
    'Cash',
    '  cAsH  ',
    ' cod ',
    'Cod',
  ];

  for (const input of cases) {
    const result = normalizePaymentMethod(input);
    assert.equal(result.isValid, true, `Expected valid for input: "${input}"`);
    assert.equal(result.isCod, true, `Expected isCod=true for input: "${input}"`);
    assert.equal(result.canonicalMethod, 'PAY_ON_DELIVERY', `Expected canonical PAY_ON_DELIVERY for: "${input}"`);
  }
});

test('T4: Valid supported prepaid methods remain unchanged and are not classified as COD', () => {
  const prepaidMethods = [
    'DEMO_UPI',
    'DEMO_CARD',
    'DEMO_WALLET',
    'PAY_LATER',
    'RAZORPAY',
    'ONLINE',
    'UPI',
    'CARD',
    'NETBANKING',
    'WALLET',
    'POS_CASH',
    'POS_UPI',
    'POS_CARD',
    'POS_SPLIT',
  ];

  for (const method of prepaidMethods) {
    const result = normalizePaymentMethod(method);
    assert.equal(result.isValid, true, `Expected valid for: ${method}`);
    assert.equal(result.isCod, false, `Expected isCod=false for prepaid: ${method}`);
    assert.equal(result.canonicalMethod, method);
  }

  // Also test case-insensitivity on prepaid
  const lowerResult = normalizePaymentMethod('  demo_upi  ');
  assert.equal(lowerResult.isValid, true);
  assert.equal(lowerResult.isCod, false);
  assert.equal(lowerResult.canonicalMethod, 'DEMO_UPI');
});

test('T5: Empty, missing, or non-string payment methods are rejected', () => {
  const emptyCases = ['', '   ', null, undefined, 123, {}, []];

  for (const input of emptyCases) {
    const result = normalizePaymentMethod(input);
    assert.equal(result.isValid, false, `Expected isValid=false for input: ${JSON.stringify(input)}`);
    assert.equal(result.canonicalMethod, null);
    assert.equal(result.isCod, false);
  }
});

test('T6: Unknown or unsupported payment method strings are rejected', () => {
  const unknownMethods = ['BITCOIN', 'CRYPTO', 'APPLE_PAY_UNSUPPORTED', 'MONOPOLY_MONEY', 'BARTER'];

  for (const method of unknownMethods) {
    const result = normalizePaymentMethod(method);
    assert.equal(result.isValid, false, `Expected isValid=false for unknown method: ${method}`);
    assert.equal(result.canonicalMethod, null);
    assert.equal(result.isCod, false);
  }
});

// ============================================================================
// PART 2: Control-Flow Integration Simulation of Route Logic
// Covers T1 through T8 End-to-End Control-Flow Behavior
// ============================================================================

/**
 * Simulates the exact decision logic in route.ts using mocks to test
 * control-flow without network or database side-effects.
 */
async function simulateOrderCreateRoute(body, mocks = {}) {
  const { payment_method, verificationToken, metadata, customer_lat, customer_lng } = body;
  const actualVerificationToken = verificationToken || metadata?.verificationToken;

  const executionLog = {
    otpChecked: false,
    geoChecked: false,
    orderPlaced: false,
    rejectedWith: null,
  };

  // 1. Payment method normalization
  const paymentInfo = normalizePaymentMethod(payment_method);
  if (!paymentInfo.isValid || !paymentInfo.canonicalMethod) {
    executionLog.rejectedWith = { status: 400, error: 'Invalid or unsupported payment method' };
    return executionLog;
  }

  const p_payment_method = paymentInfo.canonicalMethod;

  // 2. COD Validation Branch
  if (paymentInfo.isCod) {
    // OTP verification
    executionLog.otpChecked = true;
    if (!actualVerificationToken) {
      executionLog.rejectedWith = { status: 400, error: 'OTP Verification Token is required for Cash on Delivery' };
      return executionLog;
    }

    const session = mocks.otpSession ?? { is_verified: true };
    if (!session || !session.is_verified) {
      executionLog.rejectedWith = { status: 400, error: 'Invalid or unverified OTP token' };
      return executionLog;
    }

    // Geolocation verification
    const lat = metadata?.customer_lat ?? customer_lat ?? null;
    const lng = metadata?.customer_lng ?? customer_lng ?? null;

    if (lat !== null && lng !== null) {
      executionLog.geoChecked = true;
      const geoResult = mocks.geoResult ?? { valid: true, distance_meters: 50, allowed_meters: 300 };
      if (geoResult.valid === false) {
        executionLog.rejectedWith = {
          status: 400,
          error: `Cash orders can only be placed from inside the cinema. Your location is ${geoResult.distance_meters}m away (allowed: ${geoResult.allowed_meters}m).`,
        };
        return executionLog;
      }
    } else {
      executionLog.rejectedWith = {
        status: 400,
        error: 'Location verification is required for Cash on Delivery orders. Please update your app.',
      };
      return executionLog;
    }
  }

  // 3. Order Placement
  executionLog.orderPlaced = true;
  executionLog.passedPaymentMethod = p_payment_method;
  return executionLog;
}

test('T1 Control Flow: Flutter PAY_ON_DELIVERY executes OTP and Geofence checks, places order if valid', async () => {
  const body = {
    payment_method: 'PAY_ON_DELIVERY',
    verificationToken: 'token_valid_123',
    metadata: {
      customer_lat: 22.7641,
      customer_lng: 88.3696,
    },
  };

  const log = await simulateOrderCreateRoute(body, {
    otpSession: { is_verified: true },
    geoResult: { valid: true, distance_meters: 10, allowed_meters: 300 },
  });

  assert.equal(log.otpChecked, true, 'OTP check must be executed for PAY_ON_DELIVERY');
  assert.equal(log.geoChecked, true, 'Geo check must be executed for PAY_ON_DELIVERY');
  assert.equal(log.orderPlaced, true, 'Order should be placed when all checks pass');
  assert.equal(log.passedPaymentMethod, 'PAY_ON_DELIVERY');
  assert.equal(log.rejectedWith, null);
});

test('T2 Control Flow: Legacy CASH executes OTP and Geofence checks and maps to PAY_ON_DELIVERY', async () => {
  const body = {
    payment_method: 'CASH',
    verificationToken: 'token_valid_456',
    metadata: {
      customer_lat: 22.7641,
      customer_lng: 88.3696,
    },
  };

  const log = await simulateOrderCreateRoute(body, {
    otpSession: { is_verified: true },
    geoResult: { valid: true, distance_meters: 25, allowed_meters: 300 },
  });

  assert.equal(log.otpChecked, true, 'OTP check must be executed for CASH');
  assert.equal(log.geoChecked, true, 'Geo check must be executed for CASH');
  assert.equal(log.orderPlaced, true);
  assert.equal(log.passedPaymentMethod, 'PAY_ON_DELIVERY');
});

test('T4 Control Flow: Prepaid DEMO_UPI bypasses OTP and Geofence checks and proceeds directly', async () => {
  const body = {
    payment_method: 'DEMO_UPI',
  };

  const log = await simulateOrderCreateRoute(body);

  assert.equal(log.otpChecked, false, 'Prepaid orders must NOT execute COD OTP check');
  assert.equal(log.geoChecked, false, 'Prepaid orders must NOT execute COD Geo check');
  assert.equal(log.orderPlaced, true, 'Prepaid order placed directly');
  assert.equal(log.passedPaymentMethod, 'DEMO_UPI');
  assert.equal(log.rejectedWith, null);
});

test('T5 Control Flow: Missing payment method is rejected with 400 and order is NOT placed', async () => {
  const body = {};
  const log = await simulateOrderCreateRoute(body);

  assert.equal(log.orderPlaced, false);
  assert.equal(log.rejectedWith?.status, 400);
  assert.equal(log.rejectedWith?.error, 'Invalid or unsupported payment method');
});

test('T6 Control Flow: Unknown payment method is rejected with 400 and order is NOT placed', async () => {
  const body = { payment_method: 'BITCOIN' };
  const log = await simulateOrderCreateRoute(body);

  assert.equal(log.orderPlaced, false);
  assert.equal(log.rejectedWith?.status, 400);
  assert.equal(log.rejectedWith?.error, 'Invalid or unsupported payment method');
});

test('T7 Control Flow: Outside geofence for PAY_ON_DELIVERY rejects order with 400', async () => {
  const body = {
    payment_method: 'PAY_ON_DELIVERY',
    verificationToken: 'token_valid_789',
    metadata: {
      customer_lat: 22.8500, // 10 km away
      customer_lng: 88.4500,
    },
  };

  const log = await simulateOrderCreateRoute(body, {
    otpSession: { is_verified: true },
    geoResult: { valid: false, distance_meters: 9800, allowed_meters: 300 },
  });

  assert.equal(log.otpChecked, true);
  assert.equal(log.geoChecked, true);
  assert.equal(log.orderPlaced, false, 'Order must NOT be placed when outside geofence');
  assert.equal(log.rejectedWith?.status, 400);
  assert.match(log.rejectedWith?.error, /Cash orders can only be placed from inside the cinema/);
});

test('T8 Control Flow: Unverified OTP for PAY_ON_DELIVERY rejects order with 400', async () => {
  const body = {
    payment_method: 'PAY_ON_DELIVERY',
    verificationToken: 'unverified_token',
    metadata: {
      customer_lat: 22.7641,
      customer_lng: 88.3696,
    },
  };

  const log = await simulateOrderCreateRoute(body, {
    otpSession: { is_verified: false }, // Failed or unverified OTP
  });

  assert.equal(log.otpChecked, true);
  assert.equal(log.geoChecked, false, 'Geo check should not execute if OTP verification fails');
  assert.equal(log.orderPlaced, false, 'Order must NOT be placed when OTP is unverified');
  assert.equal(log.rejectedWith?.status, 400);
  assert.equal(log.rejectedWith?.error, 'Invalid or unverified OTP token');
});
