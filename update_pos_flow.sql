CREATE TABLE IF NOT EXISTS public.outlet_customers (
    id uuid default gen_random_uuid() primary key,
    short_id varchar(8) unique not null,
    phone text unique not null,
    created_at timestamptz default now()
);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS outlet_customer_id uuid references public.outlet_customers(id);
