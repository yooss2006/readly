export type Summary = { overview: string; points: string[] }

export type Article = {
  id: string
  normalized_url: string
  title: string | null
  overview: string | null
  points: string[] | null
  audio_path: string | null
  created_at: string
}

export type BeginResult = {
  state: 'cached' | 'pending' | 'started' | 'daily_limit' | 'monthly_limit' | 'not_invited' | 'scrape_paused'
  article?: Article
  job_id?: string
  phase?: 'summary' | 'audio'
}

export class ServiceError extends Error {
  constructor(message: string, public status = 500, public code = 'internal_error') {
    super(message)
  }
}
