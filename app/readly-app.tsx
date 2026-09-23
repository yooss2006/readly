'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { RegenerationRequest } from '@/lib/regeneration'

type DisplayArticle = {
  id: string; url: string; title: string | null; overview: string | null;
  points: string[] | null; hasAudio: boolean; createdAt: string
}

type RegenerationState = { pendingIds: string[]; requests: RegenerationRequest[] }

export function ReadlyApp({ email, owner, initialArticles, initialRegeneration }: {
  email: string; owner: boolean; initialArticles: DisplayArticle[]; initialRegeneration: RegenerationState
}) {
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState<'summary' | 'both'>('summary')
  const [article, setArticle] = useState<DisplayArticle | null>(null)
  const [articles, setArticles] = useState(initialArticles)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [pendingIds, setPendingIds] = useState(initialRegeneration.pendingIds)
  const [requests, setRequests] = useState(initialRegeneration.requests)
  const previousPendingIds = useRef(pendingIds)

  async function refreshRequests() {
    const response = await fetch('/api/regeneration-requests', { cache: 'no-store' })
    if (!response.ok) throw new Error('요청 목록을 새로고침하지 못했습니다.')
    const result = await response.json() as RegenerationState
    setPendingIds(result.pendingIds)
    setRequests(result.requests)
    return result
  }

  useEffect(() => {
    const timer = setInterval(() => { void refreshRequests().catch(() => {}) }, 30_000)
    return () => clearInterval(timer)
  }, [])

  function showArticle(updated: DisplayArticle) {
    setArticle(current => current?.id === updated.id ? updated : current)
    setArticles(current => [updated, ...current.filter(item => item.id !== updated.id)])
  }

  async function refreshArticle(requestUrl: string) {
    const response = await fetch(`/api/articles?url=${encodeURIComponent(requestUrl)}`, { cache: 'no-store' })
    if (!response.ok) return
    const result = await response.json() as { article: DisplayArticle | null }
    if (result.article) showArticle(result.article)
  }

  useEffect(() => {
    const completed = previousPendingIds.current.filter(id => !pendingIds.includes(id))
    previousPendingIds.current = pendingIds
    if (article && completed.includes(article.id)) void refreshArticle(article.url).catch(() => {})
  }, [pendingIds, article])

  async function loadArticle(requestUrl: string, requestMode: 'summary' | 'both') {
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/articles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: requestUrl, mode: requestMode }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '생성하지 못했습니다.')
      if (result.article) {
        setArticle(result.article)
        showArticle(result.article)
      }
      if (result.state === 'pending') setMessage('같은 글을 생성하는 중입니다. 잠시 뒤 다시 요청하면 저장된 결과가 열립니다.')
      if (result.state === 'partial') setMessage(`요약은 저장했습니다. ${result.message} 나중에 음성을 다시 추가할 수 있습니다.`)
      await refreshRequests().catch(() => {})
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '요청을 처리하지 못했습니다.')
    } finally { setBusy(false) }
  }

  function requestArticle(event: FormEvent) {
    event.preventDefault()
    void loadArticle(url, mode)
  }

  function choose(item: DisplayArticle) {
    setArticle(item)
    setUrl(item.url)
    setMessage('')
    void refreshRequests().catch(() => {})
    void refreshArticle(item.url).catch(() => {})
  }

  async function requestRegeneration(articleId: string) {
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/regeneration-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '재생성을 요청하지 못했습니다.')
      setPendingIds(current => current.includes(articleId) ? current : [...current, articleId])
      setMessage('재생성을 요청했습니다. 방장이 확인한 뒤 처리할 수 있습니다.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '요청을 처리하지 못했습니다.')
    } finally { setBusy(false) }
  }

  async function performRegeneration(articleId: string) {
    const response = await fetch('/api/articles/regenerate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || '재생성하지 못했습니다.')
    if (result.state === 'pending') return false
    if (result.article) showArticle(result.article)
    return true
  }

  async function regenerateOne(articleId: string) {
    setBusy(true)
    setMessage('')
    try {
      const created = await performRegeneration(articleId)
      await refreshRequests()
      setMessage(created ? '요약을 새로 만들었습니다. 기존 음성이 있었다면 새 요약에 맞지 않아 해제했습니다.' :
        '이 글을 생성하는 중입니다. 잠시 뒤 다시 확인해 주세요.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '재생성하지 못했습니다.')
    } finally { setBusy(false) }
  }

  async function regenerateAll() {
    setBusy(true)
    setMessage('')
    let completed = 0
    try {
      for (const [index, request] of requests.entries()) {
        setMessage(`요청 ${index + 1}/${requests.length}건 처리 중…`)
        try {
          if (await performRegeneration(request.articleId)) completed++
        } catch (error) {
          if (error instanceof Error && /한도|예산/.test(error.message)) break
        }
      }
      const remaining = await refreshRequests()
      setMessage(`${completed}건 재생성했습니다.${remaining.requests.length ? ` ${remaining.requests.length}건은 요청 목록에 남았습니다.` : ''}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '요청 목록을 새로고침하지 못했습니다.')
    } finally { setBusy(false) }
  }

  return <main className="shell">
    <header className="topbar">
      <div className="brand">Readly<span className="brand-dot">.</span></div>
      <div className="account"><span>{email}</span>{owner && <a href="#regeneration-requests" className="request-link">재생성 요청 {requests.length}건</a>}<form action="/auth/signout" method="post"><button type="submit" className="text-button">로그아웃</button></form></div>
    </header>
    <section className="hero">
      <p className="eyebrow">당신의 읽기를 위한 짧은 준비</p>
      <h1>읽기 전에<br />먼저 <em>이해하세요.</em></h1>
      <p className="hero-description">읽고 싶은 글의 주소를 넣어 보세요. 핵심을 한국어로 정리하고, 이동 중에는 음성으로 들을 수 있습니다.</p>
      <form className="request-form" onSubmit={requestArticle}>
        <label htmlFor="article-url">글 URL</label>
        <div className="input-row"><input id="article-url" type="url" required placeholder="https://example.com/article" value={url} onChange={event => setUrl(event.target.value)} /><button className="primary" disabled={busy}>{busy ? '처리 중…' : '시작하기'}</button></div>
        <fieldset className="mode-options"><legend>생성 방식</legend>
          <label><input type="radio" name="mode" checked={mode === 'summary'} onChange={() => setMode('summary')} /> 요약만</label>
          <label><input type="radio" name="mode" checked={mode === 'both'} onChange={() => setMode('both')} /> 요약 + 음성</label>
        </fieldset>
        <p className="hint">저장된 글은 생성 횟수 없이 다시 볼 수 있습니다. 새 요약·음성 생성과 재생성은 하루 5회까지 가능합니다.</p>
      </form>
      {message && <p className="notice" role="status">{message}</p>}
    </section>
    {owner && <section className="regeneration-queue" id="regeneration-requests">
      <div className="queue-heading"><div><p className="eyebrow">관리</p><h2>재생성 요청 <span>{requests.length}</span></h2></div>
        {requests.length > 0 && <button className="secondary" type="button" disabled={busy} onClick={() => void regenerateAll()}>일괄 재생성</button>}
      </div>
      {requests.length === 0 ? <p className="empty">대기 중인 재생성 요청이 없습니다.</p> :
        <div className="request-list">{requests.map(item => <div className="request-item" key={item.articleId}>
          <div><strong>{item.title || item.url}</strong><small>{item.requestedByEmail} · {new Date(item.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</small></div>
          <div className="request-actions"><button type="button" className="text-button" disabled={busy} onClick={() => void loadArticle(item.url, 'summary')}>요약 확인</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => void regenerateOne(item.articleId)}>재생성</button></div>
        </div>)}</div>}
    </section>}
    {article?.overview && <section className="result" aria-live="polite">
      <div className="result-head"><span className="eyebrow">저장된 요약</span><a href={article.url} target="_blank" rel="noopener noreferrer">원문 보기 ↗</a></div>
      <h2>{article.title || '제목 없는 글'}</h2>
      <h3>핵심 요지</h3><p>{article.overview}</p>
      <h3>주요 내용</h3><ul>{article.points?.map((point, index) => <li key={index}>{point}</li>)}</ul>
      {article.hasAudio ? <div className="audio-box"><span>음성으로 듣기</span><audio controls src={`/api/audio?id=${article.id}`} preload="none" /></div> :
        <button className="secondary" type="button" disabled={busy} onClick={() => void loadArticle(article.url, 'both')}>음성 추가하기</button>}
      <div className="regeneration-action"><button className="secondary" type="button" disabled={busy || (!owner && pendingIds.includes(article.id))}
        onClick={() => void (owner ? regenerateOne(article.id) : requestRegeneration(article.id))}>
        {owner ? '요약 바로 재생성' : pendingIds.includes(article.id) ? '재생성 요청 대기 중' : '요약 재생성 요청'}
      </button></div>
    </section>}
    <section className="library"><div className="section-title"><p className="eyebrow">보관함</p><h2>다시 읽을 글</h2></div>
      {articles.length === 0 ? <p className="empty">첫 글을 요약하면 여기에 보관됩니다.</p> :
        <div className="article-list">{articles.map(item => <button className="article-item" key={item.id} onClick={() => choose(item)}><span>{item.title || item.url}</span><small>{item.hasAudio ? '요약 · 음성' : '요약'}</small></button>)}</div>}
    </section>
  </main>
}
