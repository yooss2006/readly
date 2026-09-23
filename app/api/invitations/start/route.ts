import { NextResponse, type NextRequest } from 'next/server'
import { invitationIsActive } from '@/lib/invitations'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { token?: unknown }
    if (typeof body.token !== 'string' || !(await invitationIsActive(body.token))) {
      return NextResponse.json({ error: '사용할 수 없는 초대장입니다.' }, { status: 410 })
    }
    const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
    response.cookies.set('readly_invitation', body.token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
      path: '/auth/invite-callback', maxAge: 15 * 60,
    })
    return response
  } catch {
    return NextResponse.json({ error: '초대장을 확인하지 못했습니다.' }, { status: 500 })
  }
}
