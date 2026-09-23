import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { redeemInvitation } from '@/lib/invitations'
import { serverSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const token = (await cookies()).get('readly_invitation')?.value
  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.url))
    response.cookies.set('readly_invitation', '', {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
      path: '/auth/invite-callback', maxAge: 0,
    })
    return response
  }
  if (!token) return redirect('/login?error=oauth')
  const code = request.nextUrl.searchParams.get('code')
  if (!code) return redirect('/login?error=oauth')

  const supabase = await serverSupabase()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return redirect('/login?error=oauth')
  try {
    const { data } = await supabase.auth.getUser()
    if (!data.user?.email || !data.user.email_confirmed_at) throw new Error('Unconfirmed user')
    const state = await redeemInvitation(data.user.id, token)
    if (state === 'redeemed' || state === 'already_invited') return redirect('/')
    await supabase.auth.signOut()
    return redirect('/invite/unavailable')
  } catch {
    await supabase.auth.signOut()
    return redirect('/login?error=oauth')
  }
}
