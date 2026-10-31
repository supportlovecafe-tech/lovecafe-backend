-- ==============================================================================
-- Migration: Per-Outlet Food & Combo Stock Availability Overrides
-- Allows individual outlets to mark items as out of stock without affecting
-- global availability across other outlets.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.outlet_item_availability (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cinema_id UUID NOT NULL REFERENCES public.cinemas(id) ON DELETE CASCADE,
    item_id UUID NOT NULL,
    item_type TEXT NOT NULL CHECK (item_type IN ('FOOD', 'COMBO')),
    is_available BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_outlet_item_availability UNIQUE (cinema_id, item_id, item_type)
);

-- Index for high-performance menu filtering by outlet
CREATE INDEX IF NOT EXISTS idx_outlet_item_availability_lookup 
ON public.outlet_item_availability (cinema_id, item_id, is_available);

-- Enable Row Level Security (RLS)
ALTER TABLE public.outlet_item_availability ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Public read outlet_item_availability" ON public.outlet_item_availability;
DROP POLICY IF EXISTS "Staff mutate outlet_item_availability" ON public.outlet_item_availability;
DROP POLICY IF EXISTS "Service role full access outlet_item_availability" ON public.outlet_item_availability;

-- 1. Read policy: All clients (customer app, admin portal, POS, backend) can read
CREATE POLICY "Public read outlet_item_availability"
ON public.outlet_item_availability FOR SELECT
USING (true);

-- 2. Mutate policy: Authenticated staff / admins can manage outlet availability
CREATE POLICY "Staff mutate outlet_item_availability"
ON public.outlet_item_availability FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 3. Service role full access
CREATE POLICY "Service role full access outlet_item_availability"
ON public.outlet_item_availability FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Grant appropriate permissions
GRANT SELECT ON public.outlet_item_availability TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outlet_item_availability TO authenticated;
GRANT ALL ON public.outlet_item_availability TO service_role;

-- Add table to Supabase Realtime publication so clients get instant sync
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.outlet_item_availability;
        EXCEPTION
            WHEN duplicate_object THEN
                -- Already added
                NULL;
        END;
    END IF;
END $$;
