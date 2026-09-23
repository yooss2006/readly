import { adminSupabase } from './supabase'
import { ServiceError } from './types'

export type RegenerationRequest = {
  articleId: string
  url: string
  title: string | null
  requestedByEmail: string
  createdAt: string
}

export async function listRegenerationRequests(owner: boolean) {
  const admin = adminSupabase()
  const { data, error } = await admin.from('regeneration_requests')
    .select('article_id,requested_by_email,created_at')
    .order('created_at', { ascending: true })
  if (error) throw error
  const pendingIds = (data || []).map(row => row.article_id as string)
  if (!owner || pendingIds.length === 0) return { pendingIds, requests: [] as RegenerationRequest[] }

  const { data: articles, error: articleError } = await admin.from('articles')
    .select('id,normalized_url,title').in('id', pendingIds)
  if (articleError) throw articleError
  const byId = new Map((articles || []).map(article => [article.id, article]))
  const requests = data.flatMap(row => {
    const article = byId.get(row.article_id as string)
    if (!article) return []
    return [{
      articleId: row.article_id as string,
      url: article.normalized_url,
      title: article.title,
      requestedByEmail: row.requested_by_email as string,
      createdAt: row.created_at as string,
    }]
  })
  return { pendingIds, requests }
}

export async function requestRegeneration(userId: string, articleId: string) {
  const { data, error } = await adminSupabase().rpc('request_regeneration', {
    p_user: userId, p_article: articleId,
  })
  if (error) throw error
  const state = (data as { state: string }).state
  if (state === 'requested' || state === 'existing') return state
  if (state === 'not_found') throw new ServiceError('저장된 요약을 찾지 못했습니다.', 404, state)
  if (state === 'in_progress') throw new ServiceError('이 글을 생성하는 중입니다. 완료 후 다시 확인해 주세요.', 409, state)
  throw new ServiceError('재생성 요청 권한이 없습니다.', 403, 'not_allowed')
}
