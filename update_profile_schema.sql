ALTER TABLE public.customer_profiles ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
