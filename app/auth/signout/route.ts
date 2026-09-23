import { NextResponse, type NextRequest } from 'next/server'
import { serverSupabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const supabase = await serverSupabase()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
}
