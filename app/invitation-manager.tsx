'use client'

import { useEffect, useState } from 'react'
import type { Invitation } from '@/lib/invitations'

export function InvitationManager() {
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [generated, setGenerated] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function refresh() {
    const response = await fetch('/api/invitations', { cache: 'no-store' })
    if (!response.ok) throw new Error('초대장 목록을 불러오지 못했습니다.')
    const result = await response.json() as { invitations: Invitation[] }
    setInvitations(result.invitations)
  }

  useEffect(() => { void refresh().catch(() => setError('초대장 목록을 불러오지 못했습니다.')) }, [])

  async function create() {
    setBusy(true); setError(''); setNotice(''); setGenerated('')
    try {
      const response = await fetch('/api/invitations', { method: 'POST' })
      const result = await response.json() as { path?: string; error?: string }
      if (!response.ok || !result.path) throw new Error(result.error || '초대장을 생성하지 못했습니다.')
      setGenerated(new URL(result.path, window.location.origin).href)
      await refresh()
      setNotice('초대장이 준비됐습니다. 링크를 복사해 전달하세요. 이 링크는 지금만 표시됩니다.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : '초대장을 생성하지 못했습니다.') }
    finally { setBusy(false) }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(generated)
      setError('')
      setNotice('초대장 링크를 복사했습니다.')
    } catch { setError('복사할 수 없습니다. 링크를 직접 선택해 복사해 주세요.') }
  }

  async function revoke(id: string) {
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/invitations', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || '초대장을 취소하지 못했습니다.')
      await refresh()
      setNotice('초대장을 취소했습니다.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : '초대장을 취소하지 못했습니다.') }
    finally { setBusy(false) }
  }

  return <section className="invitation-manager" id="invitations">
    <div className="queue-heading"><div><p className="eyebrow">방장 전용</p><h2>새로운 독자 초대</h2></div>
      <button type="button" className="primary" disabled={busy} onClick={() => void create()}>
        {busy ? '처리 중…' : '초대장 생성'}
      </button>
    </div>
    <p className="invitation-help">한 사람이 한 번만 사용할 수 있는 링크입니다. 7일 뒤 만료되며, Google 로그인에 성공한 사람은 일반 사용자로 참여합니다.</p>
    {generated && <div className="invitation-share">
      <label htmlFor="invitation-link">공유할 초대장 링크</label>
      <div className="input-row"><input id="invitation-link" readOnly value={generated} onFocus={event => event.currentTarget.select()} />
        <button type="button" className="secondary" onClick={() => void copy()}>복사</button></div>
    </div>}
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    <div className="invitation-history"><h3>발급 내역</h3>
      {invitations.length === 0 ? <p className="empty">발급한 초대장이 없습니다.</p> :
        <ul>{invitations.map(item => {
          const active = !item.consumedAt && !item.revokedAt && new Date(item.expiresAt).getTime() > Date.now()
          const status = item.consumedAt ? '사용 완료' : item.revokedAt ? '취소됨' : active ? '사용 가능' : '만료됨'
          return <li key={item.id}>
            <div><strong>{status}</strong><small>발급 {new Date(item.createdAt).toLocaleString('ko-KR')} · 만료 {new Date(item.expiresAt).toLocaleString('ko-KR')}</small></div>
            {active && <button type="button" className="text-button" disabled={busy} onClick={() => void revoke(item.id)}>초대 취소</button>}
          </li>
        })}</ul>}
    </div>
  </section>
}
