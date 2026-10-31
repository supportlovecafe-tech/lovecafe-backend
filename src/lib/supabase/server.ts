import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'

export async function createClient() {
  let cookieStore: any = null;
  try {
    cookieStore = await cookies();
  } catch (e) {
    // Called outside Next.js request context (e.g. internal function call or test)
  }

  if (!cookieStore) {
    const { createClient: createBaseClient } = require('@supabase/supabase-js');
    return createBaseClient(supabaseUrl, supabaseAnonKey);
  }

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
          }
        },
      },
    }
  )
}

// Admin client for bypass / internal logic
export async function createAdminClient() {
  const activeServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!activeServiceRoleKey || activeServiceRoleKey === 'placeholder') {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required but not configured in environment');
  }

  const { createClient: createBaseClient } = require('@supabase/supabase-js');
  return createBaseClient(supabaseUrl, activeServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
