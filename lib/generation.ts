import { adminSupabase } from './supabase'
import { ExternalError, scrapeArticle, speechText, summarizeArticle, synthesizeSpeech } from './external'
import { speechReserveKrw, summaryReserveKrw } from './cost'
import { normalizeArticleUrl } from './url'
import { ServiceError, type Article, type BeginResult } from './types'

const articleFields = 'id,normalized_url,title,overview,points,audio_path,created_at'

export function publicArticle(article: Article) {
  return {
    id: article.id, url: article.normalized_url, title: article.title,
    overview: article.overview, points: article.points, hasAudio: Boolean(article.audio_path),
    createdAt: article.created_at,
  }
}

export async function findArticle(url: string) {
  const normalized = normalizeArticleUrl(url)
  const { data, error } = await adminSupabase().from('articles').select(articleFields)
    .eq('normalized_url', normalized).not('overview', 'is', null).maybeSingle()
  if (error) throw error
  return data ? publicArticle(data as Article) : null
}

export async function recentArticles() {
  const { data, error } = await adminSupabase().from('articles').select(articleFields)
    .not('overview', 'is', null).order('updated_at', { ascending: false }).limit(20)
  if (error) throw error
  return (data as Article[]).map(publicArticle)
}

function beginError(state: BeginResult['state']): ServiceError {
  switch (state) {
    case 'daily_limit': return new ServiceError('오늘의 생성 한도 5회를 모두 사용했습니다.', 429, state)
    case 'monthly_limit': return new ServiceError('이번 달 생성 예산 한도에 도달했습니다.', 429, state)
    case 'scrape_paused': return new ServiceError('본문 추출 무료 사용량이 소진되었습니다.', 503, state)
    case 'not_invited': return new ServiceError('초대된 계정만 이용할 수 있습니다.', 403, state)
    default: return new ServiceError('생성을 시작하지 못했습니다.')
  }
}

export async function generateForUser(userId: string, rawUrl: string, mode: 'summary' | 'both') {
  const url = normalizeArticleUrl(rawUrl)
  const admin = adminSupabase()
  const { data: begun, error: beginFailure } = await admin.rpc('begin_generation', {
    p_user: userId, p_url: url, p_mode: mode,
    p_summary_reserve: summaryReserveKrw(), p_audio_reserve: speechReserveKrw(),
  })
  if (beginFailure) throw beginFailure
  const begin = begun as BeginResult
  if (begin.state === 'cached' || begin.state === 'pending') {
    return { state: begin.state, article: begin.article?.overview ? publicArticle(begin.article) : null }
  }
  if (begin.state !== 'started' || !begin.job_id || !begin.article || !begin.phase) throw beginError(begin.state)

  const jobId = begin.job_id
  let currentArticle = begin.article
  let incurredKrw = 0
  try {
    if (begin.phase === 'summary') {
      const source = await scrapeArticle(url)
      const result = await summarizeArticle(source.markdown, source.title)
      incurredKrw = result.costKrw
      const { data, error } = await admin.rpc('complete_summary', {
        p_job: jobId, p_title: source.title, p_overview: result.summary.overview,
        p_points: result.summary.points, p_actual_krw: result.costKrw,
        p_audio_reserve: mode === 'both' ? speechReserveKrw() : 0,
      })
      if (error) throw error
      currentArticle = data.article as Article
      incurredKrw = 0 // The database now owns this cost and the daily charge.
      if (data.phase === 'done') return { state: 'created', article: publicArticle(currentArticle) }
    }

    const text = speechText({ overview: currentArticle.overview!, points: currentArticle.points! })
    const speech = await synthesizeSpeech(text)
    incurredKrw = speech.costKrw
    const path = `${currentArticle.id}/${jobId}.mp3`
    const { error: uploadError } = await admin.storage.from('readly-audio')
      .upload(path, speech.bytes, { contentType: 'audio/mpeg', upsert: false })
    if (uploadError) throw uploadError
    const { data, error } = await admin.rpc('complete_audio', {
      p_job: jobId, p_path: path, p_actual_krw: speech.costKrw,
    })
    if (error) {
      // A lost RPC response can follow a successful commit. Keep that file.
      const { data: saved } = await admin.from('articles').select(articleFields).eq('id', currentArticle.id).maybeSingle()
      if (saved?.audio_path === path) return { state: 'created', article: publicArticle(saved as Article) }
      await admin.storage.from('readly-audio').remove([path])
      throw error
    }
    return { state: 'created', article: publicArticle(data.article as Article) }
  } catch (error) {
    const external = error instanceof ExternalError ? error : null
    // Reconcile a summary commit whose RPC response was lost before charging
    // its cost again or reporting that the summary disappeared.
    if (!currentArticle.overview) {
      const [{ data: saved }, { data: job }] = await Promise.all([
        admin.from('articles').select(articleFields).eq('id', currentArticle.id).maybeSingle(),
        admin.from('generation_jobs').select('charged').eq('id', jobId).maybeSingle(),
      ])
      if (saved?.overview) currentArticle = saved as Article
      if (job?.charged) incurredKrw = 0
    }
    const amount = incurredKrw + (external?.incurredKrw || 0)
    await admin.rpc('fail_generation', {
      p_job: jobId, p_incurred_krw: amount,
      p_pause_firecrawl: Boolean(external?.firecrawlQuota),
    })
    if (mode === 'summary' && currentArticle.overview) {
      return { state: 'created', article: publicArticle(currentArticle) }
    }
    // A completed summary remains available when speech or storage fails.
    if (currentArticle.overview) {
      return { state: 'partial', article: publicArticle(currentArticle), message: error instanceof Error ? error.message : '음성 생성에 실패했습니다.' }
    }
    if (external) throw new ServiceError(external.message, external.firecrawlQuota ? 503 : 502, 'external_failure')
    throw error
  }
}
