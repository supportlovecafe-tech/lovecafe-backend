-- ==========================================================
-- CINEMA EATS - STAFF EMPLOYEE CODE & BONUS TRACKING SYSTEM
-- (100% SAFE: DOES NOT ALTER OR DROP ANY EXISTING FUNCTIONS)
-- ==========================================================

-- 1. Add employee_code column to public.profiles (safe: IF NOT EXISTS)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS employee_code TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_employee_code ON public.profiles(employee_code);

-- 2. Auto-assign default employee codes for existing staff who don't have one
UPDATE public.profiles
SET employee_code = 'EMP-' || UPPER(SUBSTRING(id::text, 1, 6))
WHERE (employee_code IS NULL OR employee_code = '')
  AND role IN ('OUTLET_STAFF', 'OUTLET_MANAGER', 'OUTLET_CHEF');

-- 3. Ensure staff_id column exists on public.orders (safe: IF NOT EXISTS)
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS staff_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_staff_id ON public.orders(staff_id);

-- 4. Backfill historical orders that already contain staff_id in their metadata
UPDATE public.orders
SET staff_id = (metadata->>'staff_id')::uuid
WHERE staff_id IS NULL 
  AND metadata IS NOT NULL 
  AND metadata ? 'staff_id'
  AND (metadata->>'staff_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- 5. Safe Automatic Trigger: Auto-populate orders.staff_id from metadata on all new orders
-- (This allows all existing order placement functions like place_order_secure to remain 100% untouched)
CREATE OR REPLACE FUNCTION public.set_order_staff_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.staff_id IS NULL AND NEW.metadata IS NOT NULL AND NEW.metadata ? 'staff_id' THEN
        IF (NEW.metadata->>'staff_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            NEW.staff_id := (NEW.metadata->>'staff_id')::uuid;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_order_staff_id ON public.orders;
CREATE TRIGGER trg_set_order_staff_id
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.set_order_staff_id();

-- 6. BRAND NEW Owner Reporting Function (Does NOT overwrite or collide with any existing function)
CREATE OR REPLACE FUNCTION public.get_staff_sales_report(
    p_cinema_id UUID DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_start TIMESTAMPTZ;
    v_end TIMESTAMPTZ;
    v_result JSONB;
BEGIN
    v_start := COALESCE(p_start_date, '2000-01-01'::TIMESTAMPTZ);
    v_end := COALESCE(p_end_date, now() + INTERVAL '1 day');

    SELECT jsonb_build_object(
        'summary', (
            SELECT jsonb_build_object(
                'total_sales', COALESCE(SUM(o.total_amount), 0),
                'total_orders', COUNT(o.id),
                'staff_orders', COUNT(o.id) FILTER (WHERE o.staff_id IS NOT NULL),
                'online_orders', COUNT(o.id) FILTER (WHERE o.staff_id IS NULL),
                'active_staff_count', COUNT(DISTINCT o.staff_id)
            )
            FROM public.orders o
            WHERE (p_cinema_id IS NULL OR o.cinema_id = p_cinema_id)
              AND o.timestamp >= v_start
              AND o.timestamp <= v_end
              AND o.status != 'CANCELLED'
        ),
        'staff_sales', (
            SELECT COALESCE(jsonb_agg(s ORDER BY s.total_sales DESC), '[]'::jsonb)
            FROM (
                SELECT 
                    p.id as staff_id,
                    COALESCE(p.employee_code, 'EMP-' || UPPER(SUBSTRING(p.id::text, 1, 6))) as employee_code,
                    COALESCE(NULLIF(TRIM(p.full_name), ''), TRIM(p.first_name || ' ' || COALESCE(p.last_name, '')), 'Unnamed Staff') as staff_name,
                    p.role,
                    c.id as cinema_id,
                    c.name as cinema_name,
                    COUNT(o.id) as total_orders,
                    COALESCE(SUM(o.total_amount), 0) as total_sales,
                    COALESCE(SUM(o.collected_cash), 0) as cash_collected,
                    CASE WHEN COUNT(o.id) > 0 THEN ROUND((SUM(o.total_amount) / COUNT(o.id))::numeric, 2) ELSE 0 END as avg_order_value,
                    MIN(o.timestamp) as first_order_date,
                    MAX(o.timestamp) as last_order_date
                FROM public.orders o
                JOIN public.profiles p ON o.staff_id = p.id
                LEFT JOIN public.cinemas c ON p.cinema_id = c.id
                WHERE (p_cinema_id IS NULL OR o.cinema_id = p_cinema_id)
                  AND o.timestamp >= v_start
                  AND o.timestamp <= v_end
                  AND o.status != 'CANCELLED'
                GROUP BY p.id, p.employee_code, p.full_name, p.first_name, p.last_name, p.role, c.id, c.name
            ) s
        ),
        'unassigned_sales', (
            SELECT jsonb_build_object(
                'total_sales', COALESCE(SUM(o.total_amount), 0),
                'total_orders', COUNT(o.id)
            )
            FROM public.orders o
            WHERE (p_cinema_id IS NULL OR o.cinema_id = p_cinema_id)
              AND o.timestamp >= v_start
              AND o.timestamp <= v_end
              AND o.status != 'CANCELLED'
              AND o.staff_id IS NULL
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_staff_sales_report TO authenticated, anon;
