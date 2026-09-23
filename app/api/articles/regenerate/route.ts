import { NextResponse, type NextRequest } from 'next/server'
import { authorizedUser, isOwner } from '@/lib/auth'
import { regenerateForOwner } from '@/lib/generation'
import { ServiceError } from '@/lib/types'

export const maxDuration = 300

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  try {
    const user = await authorizedUser()
    if (!isOwner(user.email)) throw new ServiceError('방장만 재생성할 수 있습니다.', 403, 'not_owner')
    const body = await request.json() as { articleId?: unknown }
    if (typeof body.articleId !== 'string' || !uuid.test(body.articleId)) {
      throw new ServiceError('글을 다시 선택해 주세요.', 400, 'invalid_article')
    }
    const result = await regenerateForOwner(user.id, body.articleId)
    return NextResponse.json(result, { status: result.state === 'pending' ? 202 : 200,
      headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    return NextResponse.json({ error: '재생성하지 못했습니다.' }, { status: 500 })
  }
}
