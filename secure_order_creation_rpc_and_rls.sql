-- ============================================================================
-- Migration: Secure Order Creation & Hardened RLS Protection (Fix 2, 2A & 2B)
-- Description:
--   1. RPC Authorization:
--      - Revoke EXECUTE on place_order_secure from PUBLIC, anon, and authenticated.
--      - Grant EXECUTE on place_order_secure exclusively to service_role.
--      - Harden place_order_secure with explicit search_path = public, pg_temp.
--      - Revoke EXECUTE on process_loyalty_order from anon and authenticated (service_role only).
--      - Restrict update_order_status_secure to authenticated staff and service_role.
--   2. Orders Table (public.orders) RLS:
--      - Revoke direct INSERT, DELETE, and UPDATE privileges from anon.
--      - Revoke direct INSERT and DELETE privileges from authenticated.
--      - SELECT Policy: Restrict to order owner (customer_id = auth.uid())
--        or authorized staff (SUPER_ADMIN, or staff assigned to order's cinema_id).
--      - UPDATE Policy: Restrict to authorized staff (SUPER_ADMIN or staff assigned
--        to order's cinema_id). Ordinary customers cannot alter order records.
--   3. Customer Profiles (public.customer_profiles) Column-Level & RLS Hardening:
--      - Revoke all privileges from PUBLIC and anon.
--      - Column-level SELECT: Grant only safe customer fields (id, user_id, phone,
--        first_name, last_name, full_name, avatar_url, email, loyalty_points, created_at, updated_at).
--      - Strictly DENY SELECT on sensitive credentials (password, secret_question, secret_answer).
--      - Column-level UPDATE: Grant only customer-editable fields (first_name, last_name,
--        full_name, avatar_url, phone, email, updated_at).
--      - Strictly PREVENT customer updates to id, user_id, loyalty_points, password,
--        secret_question, secret_answer.
--      - Row-level SELECT & UPDATE: Restrict to own profile (id = auth.uid() or user_id = auth.uid()).
--   4. Staff Profiles (public.profiles) Column-Level & RLS Hardening:
--      - Revoke all privileges from PUBLIC and anon.
--      - Column-level SELECT: Grant only operational fields (id, email, role, phone,
--        permissions, cinema_id, created_at).
--      - Strictly DENY SELECT on sensitive credentials (password, access_key, pin).
--      - Staff can only view their own profile; SUPER_ADMIN can view all.
--   5. Loyalty System (public.loyalty_wallets, public.loyalty_transactions):
--      - Revoke all from PUBLIC and anon.
--      - Block all direct client mutations (INSERT, UPDATE, DELETE).
--      - Customers can only SELECT their own wallet balance and transaction history.
--      - All point awards/redemptions performed server-side via service_role / place_order_secure.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SECURE RPC PERMISSIONS (place_order_secure & process_loyalty_order)
-- ----------------------------------------------------------------------------

-- Revoke from all overloads of place_order_secure dynamically
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT oid::regprocedure AS func_sig
        FROM pg_proc
        WHERE proname = 'place_order_secure'
          AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || r.func_sig || ' FROM PUBLIC, anon, authenticated;';
        EXECUTE 'GRANT EXECUTE ON FUNCTION ' || r.func_sig || ' TO service_role;';
        EXECUTE 'ALTER FUNCTION ' || r.func_sig || ' SET search_path = public, pg_temp;';
    END LOOP;
END $$;

-- Explicit grant to service_role on primary 13-parameter signature
GRANT EXECUTE ON FUNCTION public.place_order_secure(
    uuid, text, jsonb, double precision, text, text, text, uuid, integer, integer, uuid, uuid, jsonb
) TO service_role;

ALTER FUNCTION public.place_order_secure(
    uuid, text, jsonb, double precision, text, text, text, uuid, integer, integer, uuid, uuid, jsonb
) SET search_path = public, pg_temp;

-- Secure process_loyalty_order: Exclusively executable by service_role
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT oid::regprocedure AS func_sig
        FROM pg_proc
        WHERE proname = 'process_loyalty_order'
          AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || r.func_sig || ' FROM PUBLIC, anon, authenticated;';
        EXECUTE 'GRANT EXECUTE ON FUNCTION ' || r.func_sig || ' TO service_role;';
        EXECUTE 'ALTER FUNCTION ' || r.func_sig || ' SET search_path = public, pg_temp;';
    END LOOP;
END $$;

-- Secure update_order_status_secure: Executable by authenticated staff and service_role
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT oid::regprocedure AS func_sig
        FROM pg_proc
        WHERE proname = 'update_order_status_secure'
          AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || r.func_sig || ' FROM PUBLIC, anon;';
        EXECUTE 'GRANT EXECUTE ON FUNCTION ' || r.func_sig || ' TO authenticated, service_role;';
        EXECUTE 'ALTER FUNCTION ' || r.func_sig || ' SET search_path = public, pg_temp;';
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. HARDEN ORDERS TABLE (public.orders) RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Revoke direct mutation grants
REVOKE ALL ON public.orders FROM PUBLIC;
REVOKE INSERT, DELETE, UPDATE ON public.orders FROM anon;
REVOKE INSERT, DELETE ON public.orders FROM authenticated;

-- Drop previous broad/permissive policies
DROP POLICY IF EXISTS "Order access policy" ON public.orders;
DROP POLICY IF EXISTS "Allow all access to orders" ON public.orders;
DROP POLICY IF EXISTS "Public insert orders" ON public.orders;
DROP POLICY IF EXISTS "Allow select orders" ON public.orders;
DROP POLICY IF EXISTS "Allow staff update orders" ON public.orders;
DROP POLICY IF EXISTS "Orders select policy" ON public.orders;
DROP POLICY IF EXISTS "Orders staff update policy" ON public.orders;

-- SELECT Policy: Own orders for customers, cinema-scoped orders for staff
CREATE POLICY "Orders select policy" ON public.orders
    FOR SELECT
    TO authenticated
    USING (
        -- 1. Customer viewing their own order
        (customer_id = auth.uid())
        OR
        -- 2. Staff member viewing orders for their cinema, or Super Admin viewing all
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE (p.id = auth.uid() OR p.email = auth.jwt()->>'email')
              AND (
                  p.role = 'SUPER_ADMIN'
                  OR (p.role IN ('OUTLET_MANAGER', 'OUTLET_STAFF') AND p.cinema_id = orders.cinema_id)
              )
        )
    );

-- UPDATE Policy: Restricted strictly to authorized staff / managers
CREATE POLICY "Orders staff update policy" ON public.orders
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE (p.id = auth.uid() OR p.email = auth.jwt()->>'email')
              AND (
                  p.role = 'SUPER_ADMIN'
                  OR (p.role IN ('OUTLET_MANAGER', 'OUTLET_STAFF') AND p.cinema_id = orders.cinema_id)
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE (p.id = auth.uid() OR p.email = auth.jwt()->>'email')
              AND (
                  p.role = 'SUPER_ADMIN'
                  OR (p.role IN ('OUTLET_MANAGER', 'OUTLET_STAFF') AND p.cinema_id = orders.cinema_id)
              )
        )
    );

GRANT SELECT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

-- ----------------------------------------------------------------------------
-- 3. HARDEN CUSTOMER PROFILES (public.customer_profiles) COLUMN GRANTS & RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.customer_profiles FROM PUBLIC;
REVOKE ALL ON public.customer_profiles FROM anon;
REVOKE ALL ON public.customer_profiles FROM authenticated;

-- Column-Level SELECT: Exclude sensitive credentials (password, secret_question, secret_answer)
GRANT SELECT (
    id, user_id, phone, first_name, last_name, full_name, avatar_url, email, loyalty_points, created_at, updated_at
) ON public.customer_profiles TO authenticated;

-- Column-Level UPDATE: Only allow profile self-service fields (cannot alter id, user_id, loyalty_points, password, secret questions)
GRANT UPDATE (
    first_name, last_name, full_name, avatar_url, phone, email, updated_at
) ON public.customer_profiles TO authenticated;

-- Column-Level INSERT: Allow mobile app upsert of basic profile fields
GRANT INSERT (
    id, user_id, phone, first_name, last_name, full_name, avatar_url, email, updated_at
) ON public.customer_profiles TO authenticated;

GRANT ALL ON public.customer_profiles TO service_role;

-- Drop previous policies
DROP POLICY IF EXISTS "Public profiles access" ON public.customer_profiles;
DROP POLICY IF EXISTS "Customer profile self access" ON public.customer_profiles;
DROP POLICY IF EXISTS "Staff view customer profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Customer profile self select" ON public.customer_profiles;
DROP POLICY IF EXISTS "Customer profile self update" ON public.customer_profiles;
DROP POLICY IF EXISTS "Customer profile self insert" ON public.customer_profiles;

-- SELECT Policy: Customer views own profile; Staff views customer profiles for order lookup
CREATE POLICY "Customer profile self select" ON public.customer_profiles
    FOR SELECT
    TO authenticated
    USING (
        id = auth.uid() 
        OR (user_id IS NOT NULL AND user_id = auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE (p.id = auth.uid() OR p.email = auth.jwt()->>'email')
              AND p.role IN ('SUPER_ADMIN', 'OUTLET_MANAGER', 'OUTLET_STAFF')
        )
    );

-- UPDATE Policy: Customer can only update their own row
CREATE POLICY "Customer profile self update" ON public.customer_profiles
    FOR UPDATE
    TO authenticated
    USING (
        id = auth.uid() 
        OR (user_id IS NOT NULL AND user_id = auth.uid())
    )
    WITH CHECK (
        id = auth.uid() 
        OR (user_id IS NOT NULL AND user_id = auth.uid())
    );

-- INSERT Policy: Customer can only insert their own row
CREATE POLICY "Customer profile self insert" ON public.customer_profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (
        id = auth.uid() 
        OR (user_id IS NOT NULL AND user_id = auth.uid())
    );

-- ----------------------------------------------------------------------------
-- 4. HARDEN STAFF PROFILES (public.profiles) COLUMN GRANTS & RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.profiles FROM PUBLIC;
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.profiles FROM authenticated;

-- Column-Level SELECT: Exclude sensitive credentials (password, access_key, pin)
GRANT SELECT (
    id, email, role, phone, permissions, cinema_id, created_at
) ON public.profiles TO authenticated;

GRANT ALL ON public.profiles TO service_role;

DROP POLICY IF EXISTS "Public view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Staff view own profile" ON public.profiles;

CREATE POLICY "Staff view own profile" ON public.profiles
    FOR SELECT
    TO authenticated
    USING (
        email = auth.jwt()->>'email'
        OR id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles p2 
            WHERE (p2.id = auth.uid() OR p2.email = auth.jwt()->>'email')
              AND p2.role = 'SUPER_ADMIN'
        )
    );

-- ----------------------------------------------------------------------------
-- 5. HARDEN LOYALTY SYSTEM (wallets & transactions)
-- ----------------------------------------------------------------------------
ALTER TABLE public.loyalty_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.loyalty_wallets FROM PUBLIC, anon;
REVOKE ALL ON public.loyalty_transactions FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.loyalty_wallets FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.loyalty_transactions FROM authenticated;

GRANT SELECT (id, user_id, total_points, total_earned, total_redeemed, created_at)
    ON public.loyalty_wallets TO authenticated;

GRANT SELECT (id, user_id, amount, points, type, order_id, created_at)
    ON public.loyalty_transactions TO authenticated;

GRANT ALL ON public.loyalty_wallets TO service_role;
GRANT ALL ON public.loyalty_transactions TO service_role;

DROP POLICY IF EXISTS "Loyalty access policy" ON public.loyalty_wallets;
DROP POLICY IF EXISTS "Loyalty transactions policy" ON public.loyalty_transactions;
DROP POLICY IF EXISTS "Customer view own wallet" ON public.loyalty_wallets;
DROP POLICY IF EXISTS "Customer view own transactions" ON public.loyalty_transactions;

CREATE POLICY "Customer view own wallet" ON public.loyalty_wallets
    FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE (p.id = auth.uid() OR p.email = auth.jwt()->>'email')
              AND p.role IN ('SUPER_ADMIN', 'OUTLET_MANAGER', 'OUTLET_STAFF')
        )
    );

CREATE POLICY "Customer view own transactions" ON public.loyalty_transactions
    FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE (p.id = auth.uid() OR p.email = auth.jwt()->>'email')
              AND p.role IN ('SUPER_ADMIN', 'OUTLET_MANAGER', 'OUTLET_STAFF')
        )
    );
