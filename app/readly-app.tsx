'use client'

import { useState, type FormEvent } from 'react'

type DisplayArticle = {
  id: string; url: string; title: string | null; overview: string | null;
  points: string[] | null; hasAudio: boolean; createdAt: string
}

export function ReadlyApp({ email, initialArticles }: { email: string; initialArticles: DisplayArticle[] }) {
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState<'summary' | 'both'>('summary')
  const [article, setArticle] = useState<DisplayArticle | null>(null)
  const [articles, setArticles] = useState(initialArticles)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

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
        setArticles(current => [result.article, ...current.filter(item => item.id !== result.article.id)])
      }
      if (result.state === 'pending') setMessage('같은 글을 생성하는 중입니다. 잠시 뒤 다시 요청하면 저장된 결과가 열립니다.')
      if (result.state === 'partial') setMessage(`요약은 저장했습니다. ${result.message} 나중에 음성을 다시 추가할 수 있습니다.`)
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
  }

  return <main className="shell">
    <header className="topbar">
      <div className="brand">Readly<span className="brand-dot">.</span></div>
      <div className="account"><span>{email}</span><form action="/auth/signout" method="post"><button type="submit" className="text-button">로그아웃</button></form></div>
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
        <p className="hint">저장된 글은 생성 횟수 없이 다시 볼 수 있습니다. 새 요약 또는 음성 생성은 하루 5회까지 가능합니다.</p>
      </form>
      {message && <p className="notice" role="status">{message}</p>}
    </section>
    {article?.overview && <section className="result" aria-live="polite">
      <div className="result-head"><span className="eyebrow">저장된 요약</span><a href={article.url} target="_blank" rel="noopener noreferrer">원문 보기 ↗</a></div>
      <h2>{article.title || '제목 없는 글'}</h2>
      <h3>핵심 요지</h3><p>{article.overview}</p>
      <h3>주요 내용</h3><ul>{article.points?.map((point, index) => <li key={index}>{point}</li>)}</ul>
      {article.hasAudio ? <div className="audio-box"><span>음성으로 듣기</span><audio controls src={`/api/audio?id=${article.id}`} preload="none" /></div> :
        <button className="secondary" type="button" disabled={busy} onClick={() => void loadArticle(article.url, 'both')}>음성 추가하기</button>}
    </section>}
    <section className="library"><div className="section-title"><p className="eyebrow">보관함</p><h2>다시 읽을 글</h2></div>
      {articles.length === 0 ? <p className="empty">첫 글을 요약하면 여기에 보관됩니다.</p> :
        <div className="article-list">{articles.map(item => <button className="article-item" key={item.id} onClick={() => choose(item)}><span>{item.title || item.url}</span><small>{item.hasAudio ? '요약 · 음성' : '요약'}</small></button>)}</div>}
    </section>
  </main>
}
