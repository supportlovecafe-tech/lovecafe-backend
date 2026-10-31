/**
 * Canonical payment method constants and normalization helper.
 * Standardizes the payment-method contract across Flutter mobile, POS, and backend.
 */

// Supported Cash on Delivery / Pay on Delivery representations
export const COD_PAYMENT_METHODS = [
  'PAY_ON_DELIVERY',
  'CASH',
  'COD',
] as const;

// The canonical representation stored in the database and expected by database RPCs (e.g. place_order_secure)
export const CANONICAL_COD_METHOD = 'PAY_ON_DELIVERY';

// Supported Prepaid, Online, and POS payment methods
export const PREPAID_PAYMENT_METHODS = [
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
] as const;

export interface NormalizedPaymentMethod {
  isValid: boolean;
  canonicalMethod: string | null;
  isCod: boolean;
  rawInput: unknown;
}

/**
 * Normalizes and validates an incoming payment_method value.
 * - Trims whitespace and normalizes to uppercase.
 * - Maps all supported COD variants (PAY_ON_DELIVERY, CASH, COD) to CANONICAL_COD_METHOD ('PAY_ON_DELIVERY').
 * - Preserves supported prepaid / online / POS methods.
 * - Rejects empty, missing, non-string, or unknown payment methods.
 */
export function normalizePaymentMethod(rawInput: unknown): NormalizedPaymentMethod {
  if (typeof rawInput !== 'string') {
    return {
      isValid: false,
      canonicalMethod: null,
      isCod: false,
      rawInput,
    };
  }

  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      isValid: false,
      canonicalMethod: null,
      isCod: false,
      rawInput,
    };
  }

  const upper = trimmed.toUpperCase();

  // Check if it's a recognized COD payment method
  if ((COD_PAYMENT_METHODS as readonly string[]).includes(upper)) {
    return {
      isValid: true,
      canonicalMethod: CANONICAL_COD_METHOD,
      isCod: true,
      rawInput,
    };
  }

  // Check if it's a recognized Prepaid/Online/POS payment method
  if ((PREPAID_PAYMENT_METHODS as readonly string[]).includes(upper)) {
    return {
      isValid: true,
      canonicalMethod: upper,
      isCod: false,
      rawInput,
    };
  }

  // Unknown or unsupported payment method
  return {
    isValid: false,
    canonicalMethod: null,
    isCod: false,
    rawInput,
  };
}
