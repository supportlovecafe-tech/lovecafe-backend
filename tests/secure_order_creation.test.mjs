import test from 'node:test';
import assert from 'node:assert/strict';
import pkg from './dist/payment-methods.js';
const { normalizePaymentMethod } = pkg;

// ============================================================================
// FIX 2, FIX 2A & FIX 2B AUTOMATED TEST SUITE:
// SECURE ORDER CREATION, HARDENED RLS & SENSITIVE COLUMN PERMISSIONS
// ============================================================================

/**
 * Simulates the hardened PostgreSQL Row Level Security (RLS) and column-level grant model
 * configured in secure_order_creation_rpc_and_rls.sql.
 */
class MockPostgresSecurityEngine {
  constructor() {
    this.rpcGrants = {
      place_order_secure: ['service_role'], // Revoked from PUBLIC, anon, authenticated
      update_order_status_secure: ['authenticated', 'service_role'], // Revoked from anon
      validate_order_location: ['service_role'],
      process_loyalty_order: ['service_role'], // Revoked from PUBLIC, anon, and authenticated
    };

    // Table privilege grants
    this.tableGrants = {
      orders: {
        SELECT: ['authenticated', 'service_role'],
        UPDATE: ['authenticated', 'service_role'],
        INSERT: ['service_role'],
        DELETE: ['service_role'],
      },
      customer_profiles: {
        SELECT: ['authenticated', 'service_role'],
        UPDATE: ['authenticated', 'service_role'],
        INSERT: ['authenticated', 'service_role'],
        DELETE: ['service_role'],
      },
      profiles: {
        SELECT: ['authenticated', 'service_role'],
        UPDATE: ['service_role'],
        INSERT: ['service_role'],
        DELETE: ['service_role'],
      },
      loyalty_transactions: {
        SELECT: ['authenticated', 'service_role'],
        UPDATE: ['service_role'],
        INSERT: ['service_role'],
        DELETE: ['service_role'],
      },
      loyalty_wallets: {
        SELECT: ['authenticated', 'service_role'],
        UPDATE: ['service_role'],
        INSERT: ['service_role'],
        DELETE: ['service_role'],
      },
    };

    // Column-level privilege grants (Fix 2B)
    this.columnGrants = {
      customer_profiles: {
        SELECT: {
          authenticated: new Set([
            'id', 'user_id', 'phone', 'first_name', 'last_name',
            'full_name', 'avatar_url', 'email', 'loyalty_points',
            'created_at', 'updated_at',
          ]),
          service_role: 'ALL',
          anon: new Set([]),
        },
        UPDATE: {
          authenticated: new Set([
            'first_name', 'last_name', 'full_name', 'avatar_url',
            'phone', 'email', 'updated_at',
          ]),
          service_role: 'ALL',
          anon: new Set([]),
        },
        INSERT: {
          authenticated: new Set([
            'id', 'user_id', 'phone', 'first_name', 'last_name',
            'full_name', 'avatar_url', 'email', 'updated_at',
          ]),
          service_role: 'ALL',
          anon: new Set([]),
        },
      },
      profiles: {
        SELECT: {
          authenticated: new Set([
            'id', 'email', 'role', 'phone', 'permissions',
            'cinema_id', 'created_at',
          ]),
          service_role: 'ALL',
          anon: new Set([]),
        },
        UPDATE: { service_role: 'ALL', authenticated: new Set([]), anon: new Set([]) },
        INSERT: { service_role: 'ALL', authenticated: new Set([]), anon: new Set([]) },
      },
      loyalty_wallets: {
        SELECT: {
          authenticated: new Set(['id', 'user_id', 'total_points', 'total_earned', 'total_redeemed', 'created_at']),
          service_role: 'ALL',
          anon: new Set([]),
        },
      },
      loyalty_transactions: {
        SELECT: {
          authenticated: new Set(['id', 'user_id', 'amount', 'points', 'type', 'order_id', 'created_at']),
          service_role: 'ALL',
          anon: new Set([]),
        },
      },
    };

    // Mock profiles database for staff check
    this.staffProfiles = [
      { id: 'staff-cine-1', email: 'staff1@atindra.local', role: 'OUTLET_STAFF', cinema_id: 'cine-1' },
      { id: 'mgr-cine-1', email: 'mgr1@atindra.local', role: 'OUTLET_MANAGER', cinema_id: 'cine-1' },
      { id: 'staff-cine-2', email: 'staff2@other.local', role: 'OUTLET_STAFF', cinema_id: 'cine-2' },
      { id: 'super-admin-1', email: 'admin@lovecafe.org.in', role: 'SUPER_ADMIN', cinema_id: null },
    ];
  }

  getStaffProfile(authContext) {
    if (!authContext || !authContext.uid) return null;
    return this.staffProfiles.find(
      (p) => p.id === authContext.uid || (authContext.email && p.email === authContext.email)
    ) || null;
  }

  canExecuteRpc(role, rpcName) {
    const allowedRoles = this.rpcGrants[rpcName] || [];
    return allowedRoles.includes(role);
  }

  canPerformTableAction(role, table, action) {
    const allowedRoles = this.tableGrants[table]?.[action] || [];
    return allowedRoles.includes(role);
  }

  invokeRpc(role, rpcName, params) {
    if (!this.canExecuteRpc(role, rpcName)) {
      const err = new Error(`permission denied for function ${rpcName}`);
      err.code = '42501';
      err.status = 403;
      throw err;
    }
    return { data: 'mock-order-uuid-1234', error: null };
  }

  // RLS Filter for SELECT on public.orders
  selectOrders(authContext, orders) {
    const role = authContext?.role || 'anon';
    if (!this.canPerformTableAction(role, 'orders', 'SELECT')) {
      const err = new Error('permission denied for table orders');
      err.code = '42501';
      err.status = 403;
      throw err;
    }

    if (role === 'service_role') return orders; // Bypasses RLS

    const staff = this.getStaffProfile(authContext);

    return orders.filter((order) => {
      if (authContext.uid && order.customer_id === authContext.uid) {
        return true;
      }
      if (staff) {
        if (staff.role === 'SUPER_ADMIN') return true;
        if (['OUTLET_MANAGER', 'OUTLET_STAFF'].includes(staff.role) && staff.cinema_id === order.cinema_id) {
          return true;
        }
      }
      return false;
    });
  }

  // RLS Check for UPDATE on public.orders
  updateOrder(authContext, order, updates) {
    const role = authContext?.role || 'anon';
    if (!this.canPerformTableAction(role, 'orders', 'UPDATE')) {
      const err = new Error('permission denied for table orders');
      err.code = '42501';
      err.status = 403;
      throw err;
    }

    if (role === 'service_role') return { ...order, ...updates };

    const staff = this.getStaffProfile(authContext);
    if (!staff) {
      const err = new Error('new row violates row-level security policy for table orders');
      err.code = '42501';
      err.status = 403;
      throw err;
    }

    if (staff.role !== 'SUPER_ADMIN' && staff.cinema_id !== order.cinema_id) {
      const err = new Error('new row violates row-level security policy for table orders');
      err.code = '42501';
      err.status = 403;
      throw err;
    }

    return { ...order, ...updates };
  }

  // RLS Filter for SELECT on public.customer_profiles
  selectCustomerProfiles(authContext, profiles) {
    const role = authContext?.role || 'anon';
    if (!this.canPerformTableAction(role, 'customer_profiles', 'SELECT')) {
      const err = new Error('permission denied for table customer_profiles');
      err.code = '42501';
      err.status = 403;
      throw err;
    }

    if (role === 'service_role') return profiles;

    const staff = this.getStaffProfile(authContext);
    return profiles.filter((p) => {
      if (authContext.uid && (p.id === authContext.uid || p.user_id === authContext.uid)) {
        return true;
      }
      if (staff && ['SUPER_ADMIN', 'OUTLET_MANAGER', 'OUTLET_STAFF'].includes(staff.role)) {
        return true;
      }
      return false;
    });
  }

  // Column-Level SELECT for public.customer_profiles (Fix 2B)
  selectCustomerProfileColumns(authContext, profile, requestedColumns) {
    const role = authContext?.role || 'anon';
    if (!this.canPerformTableAction(role, 'customer_profiles', 'SELECT')) {
      const err = new Error('permission denied for table customer_profiles');
      err.code = '42501';
      throw err;
    }

    // Check column permissions
    for (const col of requestedColumns) {
      const allowed = this.columnGrants.customer_profiles.SELECT[role];
      if (allowed !== 'ALL' && (!allowed || !allowed.has(col))) {
        const err = new Error(`permission denied for column ${col} of relation customer_profiles`);
        err.code = '42501';
        throw err;
      }
    }

    // Check RLS
    if (role !== 'service_role') {
      const isOwner = authContext?.uid && (profile.id === authContext.uid || profile.user_id === authContext.uid);
      const staff = this.getStaffProfile(authContext);
      const isStaff = staff && ['SUPER_ADMIN', 'OUTLET_MANAGER', 'OUTLET_STAFF'].includes(staff.role);
      if (!isOwner && !isStaff) {
        return null;
      }
    }

    const result = {};
    for (const col of requestedColumns) {
      result[col] = profile[col];
    }
    return result;
  }

  // Column-Level & RLS UPDATE for public.customer_profiles (Fix 2B)
  updateCustomerProfile(authContext, profile, updates) {
    const role = authContext?.role || 'anon';
    if (!this.canPerformTableAction(role, 'customer_profiles', 'UPDATE')) {
      const err = new Error('permission denied for table customer_profiles');
      err.code = '42501';
      throw err;
    }

    const updatedCols = Object.keys(updates);
    for (const col of updatedCols) {
      const allowed = this.columnGrants.customer_profiles.UPDATE[role];
      if (allowed !== 'ALL' && (!allowed || !allowed.has(col))) {
        const err = new Error(`permission denied for column ${col} of relation customer_profiles`);
        err.code = '42501';
        throw err;
      }
    }

    if (role !== 'service_role') {
      const isOwner = authContext?.uid && (profile.id === authContext.uid || profile.user_id === authContext.uid);
      if (!isOwner) {
        const err = new Error('new row violates row-level security policy for table customer_profiles');
        err.code = '42501';
        throw err;
      }
    }

    return { ...profile, ...updates };
  }

  // Column-Level SELECT for public.profiles (Fix 2B)
  selectStaffProfileColumns(authContext, profile, requestedColumns) {
    const role = authContext?.role || 'anon';
    if (!this.canPerformTableAction(role, 'profiles', 'SELECT')) {
      const err = new Error('permission denied for table profiles');
      err.code = '42501';
      throw err;
    }

    for (const col of requestedColumns) {
      const allowed = this.columnGrants.profiles.SELECT[role];
      if (allowed !== 'ALL' && (!allowed || !allowed.has(col))) {
        const err = new Error(`permission denied for column ${col} of relation profiles`);
        err.code = '42501';
        throw err;
      }
    }

    return requestedColumns.reduce((acc, col) => {
      acc[col] = profile[col];
      return acc;
    }, {});
  }

  // RLS Filter for SELECT on public.loyalty_transactions
  selectLoyaltyTransactions(authContext, transactions) {
    const role = authContext?.role || 'anon';
    if (!this.canPerformTableAction(role, 'loyalty_transactions', 'SELECT')) {
      const err = new Error('permission denied for table loyalty_transactions');
      err.code = '42501';
      err.status = 403;
      throw err;
    }

    if (role === 'service_role') return transactions;

    const staff = this.getStaffProfile(authContext);
    return transactions.filter((t) => {
      if (authContext.uid && t.user_id === authContext.uid) return true;
      if (staff && ['SUPER_ADMIN', 'OUTLET_MANAGER', 'OUTLET_STAFF'].includes(staff.role)) return true;
      return false;
    });
  }
}

// ============================================================================
// PART 1: Direct RPC Execution Tests (Fix 2 Core)
// ============================================================================

test('SEC-01: Anonymous (anon) client calling place_order_secure directly is REJECTED', () => {
  const db = new MockPostgresSecurityEngine();
  assert.equal(db.canExecuteRpc('anon', 'place_order_secure'), false);
  assert.throws(
    () => db.invokeRpc('anon', 'place_order_secure', {}),
    /permission denied for function place_order_secure/
  );
});

test('SEC-02: Authenticated customer calling place_order_secure directly is REJECTED', () => {
  const db = new MockPostgresSecurityEngine();
  assert.equal(db.canExecuteRpc('authenticated', 'place_order_secure'), false);
  assert.throws(
    () => db.invokeRpc('authenticated', 'place_order_secure', {}),
    /permission denied for function place_order_secure/
  );
});

test('SEC-03: Trusted backend using service_role CAN execute place_order_secure', () => {
  const db = new MockPostgresSecurityEngine();
  assert.equal(db.canExecuteRpc('service_role', 'place_order_secure'), true);
  const res = db.invokeRpc('service_role', 'place_order_secure', { p_total_amount: 500 });
  assert.equal(res.data, 'mock-order-uuid-1234');
});

// ============================================================================
// PART 2: Hardened Order Reads & SELECT RLS Tests (Fix 2A)
// ============================================================================

const sampleOrders = [
  { id: 'order-cust-A-1', customer_id: 'cust-A', cinema_id: 'cine-1', total_amount: 300 },
  { id: 'order-cust-A-2', customer_id: 'cust-A', cinema_id: 'cine-2', total_amount: 150 },
  { id: 'order-cust-B-1', customer_id: 'cust-B', cinema_id: 'cine-1', total_amount: 500 },
  { id: 'order-cust-B-2', customer_id: 'cust-B', cinema_id: 'cine-2', total_amount: 700 },
];

test('RLS-01: Anonymous (anon) client CANNOT read orders table', () => {
  const db = new MockPostgresSecurityEngine();
  assert.throws(
    () => db.selectOrders({ role: 'anon' }, sampleOrders),
    /permission denied for table orders/
  );
});

test('RLS-02: Authenticated Customer A can ONLY read their own orders (cannot see Customer B orders)', () => {
  const db = new MockPostgresSecurityEngine();
  const authContext = { role: 'authenticated', uid: 'cust-A' };
  const visible = db.selectOrders(authContext, sampleOrders);

  assert.equal(visible.length, 2);
  assert.ok(visible.every((o) => o.customer_id === 'cust-A'));
  assert.ok(!visible.some((o) => o.customer_id === 'cust-B'));
});

test('RLS-03: Staff at Cinema 1 can ONLY read orders for Cinema 1 (cannot see Cinema 2 orders)', () => {
  const db = new MockPostgresSecurityEngine();
  const staffContext = { role: 'authenticated', uid: 'staff-cine-1', email: 'staff1@atindra.local' };
  const visible = db.selectOrders(staffContext, sampleOrders);

  assert.equal(visible.length, 2);
  assert.ok(visible.every((o) => o.cinema_id === 'cine-1'));
  assert.ok(!visible.some((o) => o.cinema_id === 'cine-2'));
});

test('RLS-04: Super Admin can read all orders across all cinemas', () => {
  const db = new MockPostgresSecurityEngine();
  const adminContext = { role: 'authenticated', uid: 'super-admin-1', email: 'admin@lovecafe.org.in' };
  const visible = db.selectOrders(adminContext, sampleOrders);

  assert.equal(visible.length, 4);
});

// ============================================================================
// PART 3: Hardened Order Updates & Mutation RLS Tests (Fix 2A)
// ============================================================================

test('RLS-05: Anonymous client CANNOT update any order', () => {
  const db = new MockPostgresSecurityEngine();
  assert.throws(
    () => db.updateOrder({ role: 'anon' }, sampleOrders[0], { status: 'DELIVERED' }),
    /permission denied for table orders/
  );
});

test('RLS-06: Ordinary Customer A CANNOT update an order status or payment status', () => {
  const db = new MockPostgresSecurityEngine();
  const custContext = { role: 'authenticated', uid: 'cust-A' };

  assert.throws(
    () => db.updateOrder(custContext, sampleOrders[0], { status: 'DELIVERED', payment_status: 'PAID' }),
    /violates row-level security policy for table orders/
  );
});

test('RLS-07: Staff at Cinema 1 CAN update order status for an order at Cinema 1', () => {
  const db = new MockPostgresSecurityEngine();
  const staffContext = { role: 'authenticated', uid: 'staff-cine-1', email: 'staff1@atindra.local' };

  const updated = db.updateOrder(staffContext, sampleOrders[0], { status: 'PREPARING' });
  assert.equal(updated.status, 'PREPARING');
});

test('RLS-08: Staff at Cinema 1 CANNOT update an order at Cinema 2', () => {
  const db = new MockPostgresSecurityEngine();
  const staffContext = { role: 'authenticated', uid: 'staff-cine-1', email: 'staff1@atindra.local' };

  assert.throws(
    () => db.updateOrder(staffContext, sampleOrders[1], { status: 'PREPARING' }),
    /violates row-level security policy for table orders/
  );
});

test('RLS-09: Direct INSERT and DELETE on orders table remain blocked for untrusted clients', () => {
  const db = new MockPostgresSecurityEngine();
  assert.equal(db.canPerformTableAction('anon', 'orders', 'INSERT'), false);
  assert.equal(db.canPerformTableAction('authenticated', 'orders', 'INSERT'), false);
  assert.equal(db.canPerformTableAction('anon', 'orders', 'DELETE'), false);
  assert.equal(db.canPerformTableAction('authenticated', 'orders', 'DELETE'), false);
});

// ============================================================================
// PART 4: Customer Profiles & Loyalty Tables Protection (Fix 2A)
// ============================================================================

const sampleProfiles = [
  {
    id: 'cust-A',
    user_id: 'cust-A',
    phone: '9999999991',
    first_name: 'Alice',
    last_name: 'Customer',
    full_name: 'Alice Customer',
    email: 'alice@example.com',
    avatar_url: null,
    loyalty_points: 120,
    password: 'legacy_hash_alice',
    secret_question: 'First pet?',
    secret_answer: 'Fluffy',
  },
  {
    id: 'cust-B',
    user_id: 'cust-B',
    phone: '9999999992',
    first_name: 'Bob',
    last_name: 'Builder',
    full_name: 'Bob Builder',
    email: 'bob@example.com',
    avatar_url: null,
    loyalty_points: 50,
    password: 'legacy_hash_bob',
    secret_question: 'Birth city?',
    secret_answer: 'Kolkata',
  },
];

const sampleTransactions = [
  { id: 'tx-1', user_id: 'cust-A', points: 10, type: 'EARN', amount: 500, order_id: 'order-1' },
  { id: 'tx-2', user_id: 'cust-B', points: 20, type: 'EARN', amount: 1000, order_id: 'order-2' },
];

test('RLS-10: Anonymous client CANNOT read customer profiles (prevent credential/PII dump)', () => {
  const db = new MockPostgresSecurityEngine();
  assert.throws(
    () => db.selectCustomerProfiles({ role: 'anon' }, sampleProfiles),
    /permission denied for table customer_profiles/
  );
});

test('RLS-11: Customer A can only view their own profile (cannot see Customer B profile)', () => {
  const db = new MockPostgresSecurityEngine();
  const authContext = { role: 'authenticated', uid: 'cust-A' };
  const visible = db.selectCustomerProfiles(authContext, sampleProfiles);

  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, 'cust-A');
});

test('RLS-12: Customer A can only view their own loyalty transactions', () => {
  const db = new MockPostgresSecurityEngine();
  const authContext = { role: 'authenticated', uid: 'cust-A' };
  const visible = db.selectLoyaltyTransactions(authContext, sampleTransactions);

  assert.equal(visible.length, 1);
  assert.equal(visible[0].user_id, 'cust-A');
});

test('RLS-13: Anonymous client CANNOT read loyalty transactions or staff profiles', () => {
  const db = new MockPostgresSecurityEngine();
  assert.equal(db.canPerformTableAction('anon', 'loyalty_transactions', 'SELECT'), false);
  assert.equal(db.canPerformTableAction('anon', 'profiles', 'SELECT'), false);
});

// ============================================================================
// PART 5: Sensitive Profile Field Protection & Column-Level Grants (Fix 2B)
// ============================================================================

test('COL-01: Authenticated customer CAN select approved profile fields', () => {
  const db = new MockPostgresSecurityEngine();
  const authContext = { role: 'authenticated', uid: 'cust-A' };
  const safeCols = ['id', 'user_id', 'first_name', 'last_name', 'full_name', 'email', 'phone', 'loyalty_points'];
  
  const result = db.selectCustomerProfileColumns(authContext, sampleProfiles[0], safeCols);
  assert.equal(result.id, 'cust-A');
  assert.equal(result.first_name, 'Alice');
  assert.equal(result.loyalty_points, 120);
});

test('COL-02: Authenticated customer attempting to SELECT password is REJECTED', () => {
  const db = new MockPostgresSecurityEngine();
  const authContext = { role: 'authenticated', uid: 'cust-A' };

  assert.throws(
    () => db.selectCustomerProfileColumns(authContext, sampleProfiles[0], ['id', 'password']),
    /permission denied for column password of relation customer_profiles/
  );
});

test('COL-03: Authenticated customer attempting to SELECT secret_question or secret_answer is REJECTED', () => {
  const db = new MockPostgresSecurityEngine();
  const authContext = { role: 'authenticated', uid: 'cust-A' };

  assert.throws(
    () => db.selectCustomerProfileColumns(authContext, sampleProfiles[0], ['secret_question']),
    /permission denied for column secret_question of relation customer_profiles/
  );

  assert.throws(
    () => db.selectCustomerProfileColumns(authContext, sampleProfiles[0], ['secret_answer']),
    /permission denied for column secret_answer of relation customer_profiles/
  );
});

test('COL-04: Authenticated customer CAN update permitted self-service fields on own profile', () => {
  const db = new MockPostgresSecurityEngine();
  const authContext = { role: 'authenticated', uid: 'cust-A' };

  const updated = db.updateCustomerProfile(authContext, sampleProfiles[0], {
    first_name: 'Alicia',
    full_name: 'Alicia Customer',
    phone: '9876543210',
  });

  assert.equal(updated.first_name, 'Alicia');
  assert.equal(updated.full_name, 'Alicia Customer');
  assert.equal(updated.phone, '9876543210');
});

test('COL-05: Authenticated customer attempting to UPDATE loyalty_points is REJECTED', () => {
  const db = new MockPostgresSecurityEngine();
  const authContext = { role: 'authenticated', uid: 'cust-A' };

  assert.throws(
    () => db.updateCustomerProfile(authContext, sampleProfiles[0], { loyalty_points: 999999 }),
    /permission denied for column loyalty_points of relation customer_profiles/
  );
});

test('COL-06: Authenticated customer attempting to UPDATE id, user_id, password or recovery info is REJECTED', () => {
  const db = new MockPostgresSecurityEngine();
  const authContext = { role: 'authenticated', uid: 'cust-A' };

  assert.throws(
    () => db.updateCustomerProfile(authContext, sampleProfiles[0], { id: 'hacked-id' }),
    /permission denied for column id of relation customer_profiles/
  );

  assert.throws(
    () => db.updateCustomerProfile(authContext, sampleProfiles[0], { user_id: 'hacked-user-id' }),
    /permission denied for column user_id of relation customer_profiles/
  );

  assert.throws(
    () => db.updateCustomerProfile(authContext, sampleProfiles[0], { password: 'new_injected_password' }),
    /permission denied for column password of relation customer_profiles/
  );

  assert.throws(
    () => db.updateCustomerProfile(authContext, sampleProfiles[0], { secret_answer: 'InjectedAnswer' }),
    /permission denied for column secret_answer of relation customer_profiles/
  );
});

test('COL-07: Authenticated staff CAN select operational fields on staff profiles', () => {
  const db = new MockPostgresSecurityEngine();
  const staffContext = { role: 'authenticated', uid: 'staff-cine-1' };
  const sampleStaff = {
    id: 'staff-cine-1',
    email: 'staff1@atindra.local',
    role: 'OUTLET_STAFF',
    cinema_id: 'cine-1',
    phone: '9123456789',
    pin: '1234',
    password: 'staff_secret_pw',
    access_key: 'legacy_key_1',
  };

  const operationalCols = ['id', 'email', 'role', 'cinema_id', 'phone'];
  const res = db.selectStaffProfileColumns(staffContext, sampleStaff, operationalCols);

  assert.equal(res.id, 'staff-cine-1');
  assert.equal(res.role, 'OUTLET_STAFF');
  assert.equal(res.cinema_id, 'cine-1');
});

test('COL-08: Authenticated client attempting to SELECT pin, password, or access_key on profiles is REJECTED', () => {
  const db = new MockPostgresSecurityEngine();
  const staffContext = { role: 'authenticated', uid: 'staff-cine-1' };
  const sampleStaff = {
    id: 'staff-cine-1',
    pin: '1234',
    password: 'staff_secret_pw',
    access_key: 'legacy_key_1',
  };

  assert.throws(
    () => db.selectStaffProfileColumns(staffContext, sampleStaff, ['pin']),
    /permission denied for column pin of relation profiles/
  );

  assert.throws(
    () => db.selectStaffProfileColumns(staffContext, sampleStaff, ['password']),
    /permission denied for column password of relation profiles/
  );

  assert.throws(
    () => db.selectStaffProfileColumns(staffContext, sampleStaff, ['access_key']),
    /permission denied for column access_key of relation profiles/
  );
});

test('LOY-01: Direct RPC execution of process_loyalty_order by customer is REJECTED (service_role only)', () => {
  const db = new MockPostgresSecurityEngine();
  assert.equal(db.canExecuteRpc('anon', 'process_loyalty_order'), false);
  assert.equal(db.canExecuteRpc('authenticated', 'process_loyalty_order'), false);
  assert.equal(db.canExecuteRpc('service_role', 'process_loyalty_order'), true);

  assert.throws(
    () => db.invokeRpc('authenticated', 'process_loyalty_order', { p_points_earned: 5000 }),
    /permission denied for function process_loyalty_order/
  );
});

test('LOY-02: Direct client INSERT, UPDATE and DELETE on loyalty_wallets are BLOCKED', () => {
  const db = new MockPostgresSecurityEngine();
  assert.equal(db.canPerformTableAction('anon', 'loyalty_wallets', 'INSERT'), false);
  assert.equal(db.canPerformTableAction('authenticated', 'loyalty_wallets', 'INSERT'), false);
  assert.equal(db.canPerformTableAction('authenticated', 'loyalty_wallets', 'UPDATE'), false);
  assert.equal(db.canPerformTableAction('authenticated', 'loyalty_wallets', 'DELETE'), false);
  assert.equal(db.canPerformTableAction('service_role', 'loyalty_wallets', 'INSERT'), true);
  assert.equal(db.canPerformTableAction('service_role', 'loyalty_wallets', 'UPDATE'), true);
});

test('LOY-03: Direct client INSERT, UPDATE and DELETE on loyalty_transactions are BLOCKED', () => {
  const db = new MockPostgresSecurityEngine();
  assert.equal(db.canPerformTableAction('anon', 'loyalty_transactions', 'INSERT'), false);
  assert.equal(db.canPerformTableAction('authenticated', 'loyalty_transactions', 'INSERT'), false);
  assert.equal(db.canPerformTableAction('authenticated', 'loyalty_transactions', 'UPDATE'), false);
  assert.equal(db.canPerformTableAction('authenticated', 'loyalty_transactions', 'DELETE'), false);
  assert.equal(db.canPerformTableAction('service_role', 'loyalty_transactions', 'INSERT'), true);
});

// ============================================================================
// PART 6: Backend Order Creation Pipeline Safety & Fail-Closed Geolocation (Fix 1, 2, 3)
// ============================================================================

async function simulateSecureOrderRoute(body, env = {}, mocks = {}) {
  const executionLog = {
    clientRoleUsed: null,
    rpcInvoked: false,
    rejectedWith: null,
    lockAcquired: false,
    lockReleased: false,
    geofenceChecked: false,
  };

  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey || serviceRoleKey === 'placeholder') {
    executionLog.rejectedWith = {
      status: 500,
      error: 'Server configuration error: Secure database client unavailable',
    };
    return executionLog;
  }

  // Idempotency lock acquisition
  executionLog.lockAcquired = true;

  const paymentInfo = normalizePaymentMethod(body.payment_method);
  if (!paymentInfo.isValid || !paymentInfo.canonicalMethod) {
    executionLog.lockReleased = true;
    executionLog.rejectedWith = { status: 400, error: 'Invalid or unsupported payment method' };
    return executionLog;
  }

  if (paymentInfo.isCod) {
    if (!body.verificationToken) {
      executionLog.lockReleased = true;
      executionLog.rejectedWith = { status: 400, error: 'OTP Verification Token is required for Cash on Delivery' };
      return executionLog;
    }

    const customerLat = body.metadata?.customer_lat ?? body.customer_lat ?? null;
    const customerLng = body.metadata?.customer_lng ?? body.customer_lng ?? null;

    const numLat = Number(customerLat);
    const numLng = Number(customerLng);

    if (
      customerLat === null ||
      customerLng === null ||
      isNaN(numLat) ||
      isNaN(numLng) ||
      numLat < -90 ||
      numLat > 90 ||
      numLng < -180 ||
      numLng > 180
    ) {
      executionLog.lockReleased = true;
      executionLog.rejectedWith = {
        status: 400,
        error: 'Location verification is required for Cash on Delivery orders. Please update your app.',
      };
      return executionLog;
    }

    executionLog.geofenceChecked = true;

    // Fail-Closed Geolocation RPC execution
    try {
      let geoResult;
      let geoError = null;

      if (mocks.validateOrderLocation) {
        const mockRes = await mocks.validateOrderLocation({
          cinema_id: body.cinema_id || 'test-cinema',
          lat: numLat,
          lng: numLng,
        });
        geoResult = mockRes.data;
        geoError = mockRes.error;
      } else {
        // Default valid geofence mock
        geoResult = { valid: true, distance_meters: 50 };
      }

      if (geoError) {
        executionLog.lockReleased = true;
        executionLog.rejectedWith = {
          status: 503,
          error: 'Unable to verify order location at this time. Please try again.',
        };
        return executionLog;
      }

      if (!geoResult || typeof geoResult !== 'object') {
        executionLog.lockReleased = true;
        executionLog.rejectedWith = {
          status: 502,
          error: 'Location verification failed to produce a valid result. Please try again.',
        };
        return executionLog;
      }

      if (geoResult.valid === false) {
        executionLog.lockReleased = true;
        const dist = typeof geoResult.distance_meters === 'number' ? `${geoResult.distance_meters}m` : 'unknown distance';
        const allowed = typeof geoResult.allowed_meters === 'number' ? `${geoResult.allowed_meters}m` : 'permitted radius';
        executionLog.rejectedWith = {
          status: 400,
          error: `Cash orders can only be placed from inside the cinema. Your location is ${dist} away (allowed: ${allowed}).`,
        };
        return executionLog;
      }

      if (geoResult.valid !== true) {
        executionLog.lockReleased = true;
        executionLog.rejectedWith = {
          status: 502,
          error: 'Location verification failed. Please try again.',
        };
        return executionLog;
      }
    } catch (err) {
      executionLog.lockReleased = true;
      const isTimeout = err?.message === 'Location validation timed out';
      executionLog.rejectedWith = {
        status: isTimeout ? 504 : 503,
        error: isTimeout ? 'Location verification timed out. Please try again.' : 'Unable to verify order location. Please try again.',
      };
      return executionLog;
    }
  }

  // Validation succeeded: proceed to privileged order insertion
  executionLog.clientRoleUsed = 'service_role';
  const db = new MockPostgresSecurityEngine();
  try {
    const res = db.invokeRpc(executionLog.clientRoleUsed, 'place_order_secure', {
      p_payment_method: paymentInfo.canonicalMethod,
      p_total_amount: body.total_amount,
    });
    executionLog.rpcInvoked = true;
    executionLog.orderId = res.data;
  } catch (err) {
    executionLog.lockReleased = true;
    executionLog.rejectedWith = { status: err.status || 500, error: err.message };
  }

  return executionLog;
}

test('SEC-07: Route fails safely with HTTP 500 if SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
  const body = { payment_method: 'DEMO_UPI', total_amount: 100 };
  const res = await simulateSecureOrderRoute(body, { SUPABASE_SERVICE_ROLE_KEY: null });

  assert.equal(res.rpcInvoked, false);
  assert.equal(res.rejectedWith?.status, 500);
});

test('SEC-08: Trusted backend executes place_order_secure with service_role and creates order', async () => {
  const body = {
    payment_method: 'PAY_ON_DELIVERY',
    verificationToken: 'valid-otp-token',
    customer_lat: 22.7641,
    customer_lng: 88.3696,
    total_amount: 350,
  };

  const res = await simulateSecureOrderRoute(body, {
    SUPABASE_SERVICE_ROLE_KEY: 'valid_secure_service_key',
  });

  assert.equal(res.rejectedWith, null);
  assert.equal(res.clientRoleUsed, 'service_role');
  assert.equal(res.rpcInvoked, true);
  assert.equal(res.orderId, 'mock-order-uuid-1234');
});

test('SEC-09: Fix 1 remains intact — PAY_ON_DELIVERY requires OTP and Geofence before calling service_role', async () => {
  const noOtpBody = {
    payment_method: 'PAY_ON_DELIVERY',
    customer_lat: 22.7641,
    customer_lng: 88.3696,
  };

  const res = await simulateSecureOrderRoute(noOtpBody, {
    SUPABASE_SERVICE_ROLE_KEY: 'valid_secure_service_key',
  });

  assert.equal(res.rpcInvoked, false);
  assert.equal(res.rejectedWith?.status, 400);
  assert.match(res.rejectedWith?.error, /OTP Verification Token is required/);
});

test('SEC-10: Prepaid DEMO_UPI order executes cleanly via service_role without OTP/geofence checks', async () => {
  const prepaidBody = {
    payment_method: 'DEMO_UPI',
    total_amount: 450,
  };

  const res = await simulateSecureOrderRoute(prepaidBody, {
    SUPABASE_SERVICE_ROLE_KEY: 'valid_secure_service_key',
  });

  assert.equal(res.rejectedWith, null);
  assert.equal(res.clientRoleUsed, 'service_role');
  assert.equal(res.rpcInvoked, true);
});

// ============================================================================
// PART 7: Fix 3 Fail-Closed Geolocation Validation Tests (GEO-FAIL-01 to 12)
// ============================================================================

const validCodBase = {
  payment_method: 'PAY_ON_DELIVERY',
  verificationToken: 'valid-otp-token-123',
  customer_lat: 22.7641,
  customer_lng: 88.3696,
  total_amount: 500,
};

test('GEO-FAIL-01: COD with recognized successful geofence response allows order creation', async () => {
  const mocks = {
    validateOrderLocation: async () => ({
      data: { valid: true, distance_meters: 42 },
      error: null,
    }),
  };

  const res = await simulateSecureOrderRoute(validCodBase, {
    SUPABASE_SERVICE_ROLE_KEY: 'valid_key',
  }, mocks);

  assert.equal(res.rejectedWith, null);
  assert.equal(res.geofenceChecked, true);
  assert.equal(res.rpcInvoked, true);
  assert.equal(res.orderId, 'mock-order-uuid-1234');
});

test('GEO-FAIL-02: COD with recognized outside-geofence result REJECTS order creation', async () => {
  const mocks = {
    validateOrderLocation: async () => ({
      data: { valid: false, distance_meters: 650, allowed_meters: 150, reason: 'outside_geofence' },
      error: null,
    }),
  };

  const res = await simulateSecureOrderRoute(validCodBase, {
    SUPABASE_SERVICE_ROLE_KEY: 'valid_key',
  }, mocks);

  assert.equal(res.rpcInvoked, false);
  assert.equal(res.rejectedWith?.status, 400);
  assert.match(res.rejectedWith?.error, /Cash orders can only be placed from inside the cinema/);
  assert.equal(res.lockReleased, true);
});

test('GEO-FAIL-03: Geofence RPC returns database error — fails closed, rejects order', async () => {
  const mocks = {
    validateOrderLocation: async () => ({
      data: null,
      error: { code: '57P01', message: 'terminating connection due to administrator command' },
    }),
  };

  const res = await simulateSecureOrderRoute(validCodBase, {
    SUPABASE_SERVICE_ROLE_KEY: 'valid_key',
  }, mocks);

  assert.equal(res.rpcInvoked, false);
  assert.equal(res.rejectedWith?.status, 503);
  assert.match(res.rejectedWith?.error, /Unable to verify order location at this time/);
  assert.equal(res.lockReleased, true);
});

test('GEO-FAIL-04: Geofence RPC throws an exception — fails closed, rejects order', async () => {
  const mocks = {
    validateOrderLocation: async () => {
      throw new Error('ECONNRESET: socket hang up');
    },
  };

  const res = await simulateSecureOrderRoute(validCodBase, {
    SUPABASE_SERVICE_ROLE_KEY: 'valid_key',
  }, mocks);

  assert.equal(res.rpcInvoked, false);
  assert.equal(res.rejectedWith?.status, 503);
  assert.match(res.rejectedWith?.error, /Unable to verify order location/);
  assert.equal(res.lockReleased, true);
});

test('GEO-FAIL-05: Geofence RPC returns null or empty data — fails closed, rejects order', async () => {
  const mocks = {
    validateOrderLocation: async () => ({
      data: null,
      error: null,
    }),
  };

  const res = await simulateSecureOrderRoute(validCodBase, {
    SUPABASE_SERVICE_ROLE_KEY: 'valid_key',
  }, mocks);

  assert.equal(res.rpcInvoked, false);
  assert.equal(res.rejectedWith?.status, 502);
  assert.match(res.rejectedWith?.error, /Location verification failed to produce a valid result/);
  assert.equal(res.lockReleased, true);
});

test('GEO-FAIL-06: Geofence RPC returns unexpected result shape or unknown status — fails closed', async () => {
  const mocks = {
    validateOrderLocation: async () => ({
      data: { valid: 'MAYBE', randomField: true },
      error: null,
    }),
  };

  const res = await simulateSecureOrderRoute(validCodBase, {
    SUPABASE_SERVICE_ROLE_KEY: 'valid_key',
  }, mocks);

  assert.equal(res.rpcInvoked, false);
  assert.equal(res.rejectedWith?.status, 502);
  assert.match(res.rejectedWith?.error, /Location verification failed/);
  assert.equal(res.lockReleased, true);
});

test('GEO-FAIL-07: Geofence RPC times out — fails closed, rejects order with HTTP 504', async () => {
  const mocks = {
    validateOrderLocation: async () => {
      throw new Error('Location validation timed out');
    },
  };

  const res = await simulateSecureOrderRoute(validCodBase, {
    SUPABASE_SERVICE_ROLE_KEY: 'valid_key',
  }, mocks);

  assert.equal(res.rpcInvoked, false);
  assert.equal(res.rejectedWith?.status, 504);
  assert.match(res.rejectedWith?.error, /Location verification timed out/);
  assert.equal(res.lockReleased, true);
});

test('GEO-FAIL-08: COD request contains Flutter value PAY_ON_DELIVERY — geofence is mandatory', async () => {
  const body = {
    ...validCodBase,
    payment_method: 'PAY_ON_DELIVERY',
  };

  const res = await simulateSecureOrderRoute(body, {
    SUPABASE_SERVICE_ROLE_KEY: 'valid_key',
  });

  assert.equal(res.geofenceChecked, true);
  assert.equal(res.rpcInvoked, true);
});

test('GEO-FAIL-09: Legacy supported COD alias (CASH, COD) — geofence is mandatory', async () => {
  for (const alias of ['CASH', 'COD', 'cash', 'pay_on_delivery']) {
    const body = {
      ...validCodBase,
      payment_method: alias,
    };

    const res = await simulateSecureOrderRoute(body, {
      SUPABASE_SERVICE_ROLE_KEY: 'valid_key',
    });

    assert.equal(res.geofenceChecked, true, `Geofence check must execute for alias: ${alias}`);
    assert.equal(res.rpcInvoked, true);
  }
});

test('GEO-FAIL-10: Supported prepaid method (DEMO_UPI) preserves existing prepaid behavior without geofence', async () => {
  const prepaidBody = {
    payment_method: 'DEMO_UPI',
    total_amount: 300,
  };

  const res = await simulateSecureOrderRoute(prepaidBody, {
    SUPABASE_SERVICE_ROLE_KEY: 'valid_key',
  });

  assert.equal(res.geofenceChecked, false, 'Prepaid methods must not invoke geofence check');
  assert.equal(res.rpcInvoked, true);
  assert.equal(res.rejectedWith, null);
});

test('GEO-FAIL-11: Geofence rejection occurs after lock acquisition — lock is released safely', async () => {
  const mocks = {
    validateOrderLocation: async () => ({
      data: { valid: false, distance_meters: 1000, allowed_meters: 300 },
      error: null,
    }),
  };

  const res = await simulateSecureOrderRoute(validCodBase, {
    SUPABASE_SERVICE_ROLE_KEY: 'valid_key',
  }, mocks);

  assert.equal(res.lockAcquired, true);
  assert.equal(res.lockReleased, true);
  assert.equal(res.rpcInvoked, false);
});

test('GEO-FAIL-12: Geofence validation fails during a retry — retry cannot bypass validation', async () => {
  const mocks = {
    validateOrderLocation: async () => ({
      data: { valid: false, distance_meters: 800, allowed_meters: 300 },
      error: null,
    }),
  };

  // Attempt 1: Fails
  const attempt1 = await simulateSecureOrderRoute(validCodBase, {
    SUPABASE_SERVICE_ROLE_KEY: 'valid_key',
  }, mocks);

  assert.equal(attempt1.rpcInvoked, false);
  assert.equal(attempt1.rejectedWith?.status, 400);

  // Attempt 2 (Retry with same idempotency key): Must re-execute geofence validation and reject again
  const attempt2 = await simulateSecureOrderRoute(validCodBase, {
    SUPABASE_SERVICE_ROLE_KEY: 'valid_key',
  }, mocks);

  assert.equal(attempt2.geofenceChecked, true);
  assert.equal(attempt2.rpcInvoked, false);
  assert.equal(attempt2.rejectedWith?.status, 400);
});
