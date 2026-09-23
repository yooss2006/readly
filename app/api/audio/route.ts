import { NextResponse, type NextRequest } from 'next/server'
import { authorizedUser } from '@/lib/auth'
import { adminSupabase } from '@/lib/supabase'
import { ServiceError } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    await authorizedUser()
    const id = request.nextUrl.searchParams.get('id')
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 400 })
    const admin = adminSupabase()
    const { data: article, error } = await admin.from('articles').select('audio_path').eq('id', id).maybeSingle()
    if (error) throw error
    if (!article?.audio_path) return new NextResponse(null, { status: 404 })
    const { data, error: signError } = await admin.storage.from('readly-audio').createSignedUrl(article.audio_path, 60)
    if (signError || !data?.signedUrl) throw signError || new Error('missing signed URL')
    return NextResponse.redirect(data.signedUrl, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return new NextResponse(null, { status: error instanceof ServiceError ? error.status : 500 })
  }
}
