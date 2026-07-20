-- Add assigned_staffs column to kds_screen_configs table
ALTER TABLE public.kds_screen_configs ADD COLUMN IF NOT EXISTS assigned_staffs UUID[] DEFAULT '{}';
