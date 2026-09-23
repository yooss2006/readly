import { NextResponse, type NextRequest } from 'next/server'
import { authorizedUser, isOwner } from '@/lib/auth'
import { listRegenerationRequests, requestRegeneration } from '@/lib/regeneration'
import { ServiceError } from '@/lib/types'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function failed(error: unknown) {
  return error instanceof ServiceError
    ? NextResponse.json({ error: error.message }, { status: error.status })
    : NextResponse.json({ error: '요청을 처리하지 못했습니다.' }, { status: 500 })
}

export async function GET() {
  try {
    const user = await authorizedUser()
    return NextResponse.json(await listRegenerationRequests(isOwner(user.email)), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) { return failed(error) }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authorizedUser()
    if (isOwner(user.email)) throw new ServiceError('방장은 바로 재생성할 수 있습니다.', 403, 'owner')
    const body = await request.json() as { articleId?: unknown }
    if (typeof body.articleId !== 'string' || !uuid.test(body.articleId)) {
      throw new ServiceError('글을 다시 선택해 주세요.', 400, 'invalid_article')
    }
    const state = await requestRegeneration(user.id, body.articleId)
    return NextResponse.json({ state }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return failed(error) }
}
