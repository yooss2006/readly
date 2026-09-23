import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function publicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error('Supabase 공개 환경 변수가 없습니다.')
  return { url, key }
}

export async function serverSupabase() {
  const { url, key } = publicConfig()
  const cookieStore = await cookies()
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        try {
          for (const item of items) cookieStore.set(item.name, item.value, item.options)
        } catch {
          // Server Components cannot set cookies; route handlers can.
        }
      },
    },
  })
}

export function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase 서버 환경 변수가 없습니다.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}
