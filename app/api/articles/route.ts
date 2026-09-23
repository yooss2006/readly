import { NextResponse, type NextRequest } from 'next/server'
import { authorizedUser } from '@/lib/auth'
import { findArticle, generateForUser } from '@/lib/generation'
import { ServiceError } from '@/lib/types'

export const maxDuration = 300

function failed(error: unknown) {
  if (error instanceof ServiceError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
  if (error instanceof Error && /URL|PDF|공개 웹/.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ error: '요청을 처리하지 못했습니다.' }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    await authorizedUser()
    const url = request.nextUrl.searchParams.get('url')
    if (!url) return NextResponse.json({ error: 'URL이 필요합니다.' }, { status: 400 })
    return NextResponse.json({ article: await findArticle(url) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return failed(error) }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authorizedUser()
    const body = await request.json() as { url?: unknown; mode?: unknown }
    if (typeof body.url !== 'string' || !['summary', 'both'].includes(String(body.mode))) {
      return NextResponse.json({ error: 'URL과 생성 방식을 확인해 주세요.' }, { status: 400 })
    }
    const result = await generateForUser(user.id, body.url, body.mode as 'summary' | 'both')
    return NextResponse.json(result, { status: result.state === 'pending' ? 202 : 200,
      headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return failed(error) }
}
