import { NextResponse, type NextRequest } from 'next/server'
import { serverSupabase } from '@/lib/supabase'
import { authorizedUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/login?error=oauth', request.url))
  const supabase = await serverSupabase()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(new URL('/login?error=oauth', request.url))
  try {
    await authorizedUser()
  } catch {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?error=not_invited', request.url))
  }
  return NextResponse.redirect(new URL('/', request.url))
}
