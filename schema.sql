-- ===================================================
-- CINEMA EATS - ARCHITECTURAL SOURCE OF TRUTH (v2)
-- This file consolidates all schema changes and fixes.
-- ===================================================

-- 1. EXTENSIONS
create extension if not exists "uuid-ossp";

-- 2. TABLES

-- Cinemas Table (Tenants)
create table if not exists public.cinemas (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  location text not null,
  rating text default '5.0',
  feature text,
  image_url text,
  owner_id uuid references auth.users(id),
  login_email text, -- For staff/outlet login
  login_password text, -- For staff/outlet login
  allowed_payment_methods jsonb default '["DEMO_UPI", "DEMO_CARD", "PAY_ON_DELIVERY", "PAY_LATER"]'::jsonb,
  created_at timestamptz default now()
);

-- Profiles Table (Staff, Managers, Admins)
create table if not exists public.profiles (
  id uuid default gen_random_uuid() primary key,
  email text unique,
  role text check (role in ('CUSTOMER', 'SUPER_ADMIN', 'OUTLET_MANAGER', 'OUTLET_STAFF')),
  password text, -- For demo login bypass
  access_key text, -- Legacy password field
  pin text, -- For quick staff login
  permissions jsonb default '[]'::jsonb,
  phone text,
  cinema_id uuid references public.cinemas(id),
  created_at timestamptz default now()
);

-- Screens Table
create table if not exists public.screens (
  id uuid default gen_random_uuid() primary key,
  cinema_id uuid references public.cinemas(id) on delete cascade,
  name text not null,
  floor text,
  tag text,
  created_at timestamptz default now()
);

-- Food Items Table
create table if not exists public.food_items (
  id uuid default gen_random_uuid() primary key,
  cinema_id uuid references public.cinemas(id) on delete cascade,
  name text not null,
  description text,
  price double precision not null,
  image_url text,
  category text not null,
  is_available boolean default true,
  created_at timestamptz default now()
);

-- Customer Profiles (Bypass auth.users for mobile app)
create table if not exists public.customer_profiles (
  id uuid default gen_random_uuid() primary key,
  phone text not null unique,
  password text not null,
  first_name text not null,
  last_name text not null,
  email text,
  secret_question text,
  secret_answer text,
  loyalty_points integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Loyalty System
create table if not exists public.loyalty_wallets (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.customer_profiles(id) on delete cascade,
    total_points integer default 0,
    total_earned integer default 0,
    total_redeemed integer default 0,
    created_at timestamptz default now()
);

create table if not exists public.loyalty_transactions (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.customer_profiles(id) on delete cascade,
    amount double precision,
    points integer,
    type text check (type in ('EARN', 'REDEEM')),
    order_id uuid,
    created_at timestamptz default now()
);

-- Orders Table
create table if not exists public.orders (
  id uuid default gen_random_uuid() primary key,
  display_id text,
  cinema_id uuid references public.cinemas(id) on delete cascade,
  customer_id uuid references auth.users(id),
  customer_profile_id uuid references public.customer_profiles(id),
  items jsonb not null default '[]'::jsonb,
  total_amount double precision not null default 0,
  status text not null default 'PENDING',
  location text not null,
  payment_status text not null default 'PENDING',
  payment_method text not null default 'DEMO_UPI',
  customer_phone text not null,
  is_demo_order boolean default false,
  points_earned integer default 0,
  points_redeemed integer default 0,
  client_uuid uuid unique, -- Idempotency Key
  timestamp timestamptz not null default now()
);

-- Live Support Messages
create table if not exists public.order_messages (
    id uuid default gen_random_uuid() primary key,
    order_id uuid references public.orders(id) on delete cascade,
    sender_role text not null check (sender_role in ('CUSTOMER', 'OUTLET')),
    content text not null,
    created_at timestamptz default now(),
    is_read boolean default false
);

-- 3. INDEXES (Performance Optimizations)
create index if not exists idx_orders_customer_phone on public.orders(customer_phone);
create index if not exists idx_orders_cinema_id on public.orders(cinema_id);
create index if not exists idx_orders_client_uuid on public.orders(client_uuid);
create index if not exists idx_food_items_cinema_available on public.food_items(cinema_id, is_available);
create index if not exists idx_customer_profiles_phone on public.customer_profiles(phone);

-- 3. FUNCTIONS & RPCs

-- Process Loyalty Order
create or replace function public.process_loyalty_order(
  p_user_id uuid,
  p_order_id uuid,
  p_points_redeemed integer,
  p_redeemed_value double precision,
  p_points_earned integer
)
returns void as $$
begin
  -- Update order with loyalty info
  update public.orders 
  set points_redeemed = p_points_redeemed,
      points_earned = p_points_earned
  where id = p_order_id;

  -- Update customer profile points
  update public.customer_profiles
  set loyalty_points = loyalty_points - p_points_redeemed + p_points_earned
  where id = p_user_id;
  
  -- Record transaction (Optional but good for history)
  if p_points_earned > 0 then
    insert into public.loyalty_transactions(user_id, points, type, order_id)
    values (p_user_id, p_points_earned, 'EARN', p_order_id);
  end if;
  
  if p_points_redeemed > 0 then
    insert into public.loyalty_transactions(user_id, points, type, order_id)
    values (p_user_id, p_points_redeemed, 'REDEEM', p_order_id);
  end if;
end;
$$ language plpgsql security definer;

-- 4. SECURITY (RLS)

alter table public.cinemas enable row level security;
alter table public.profiles enable row level security;
alter table public.screens enable row level security;
alter table public.food_items enable row level security;
alter table public.orders enable row level security;
alter table public.customer_profiles enable row level security;
alter table public.order_messages enable row level security;
alter table public.loyalty_wallets enable row level security;
alter table public.loyalty_transactions enable row level security;

-- Policies (Relaxed for current Demo/Debugging state as found in 'apply_fix.sql')
create policy "Public view cinemas" on public.cinemas for select using (true);
create policy "Public view profiles" on public.profiles for select using (true);
create policy "Public view screens" on public.screens for select using (true);
create policy "Public view food items" on public.food_items for select using (true);
create policy "Public profiles access" on public.customer_profiles for all using (true) with check (true);
create policy "Order access policy" on public.orders for all using (true) with check (true);
create policy "Order messages access" on public.order_messages for all using (true) with check (true);
create policy "Loyalty access policy" on public.loyalty_wallets for all using (true) with check (true);
create policy "Loyalty transactions policy" on public.loyalty_transactions for all using (true) with check (true);

-- 5. PERMISSIONS

grant all on all tables in schema public to anon;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to anon;
grant all on all sequences in schema public to authenticated;
grant execute on function public.process_loyalty_order(uuid, uuid, integer, double precision, integer) to anon;
grant execute on function public.process_loyalty_order(uuid, uuid, integer, double precision, integer) to authenticated;
