'use client'

import { useState } from 'react'
import { browserSupabase } from '@/lib/supabase-browser'

export function LoginButton() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  async function signIn() {
    setLoading(true)
    setError('')
    try {
      const { error } = await browserSupabase().auth.signInWithOAuth({
        provider: 'google', options: { redirectTo: `${location.origin}/auth/callback` },
      })
      if (error) throw error
    } catch {
      setError('로그인을 시작하지 못했습니다. 설정을 확인해 주세요.')
      setLoading(false)
    }
  }
  return <>
    <button type="button" className="primary wide" onClick={signIn} disabled={loading}>
      {loading ? '이동하는 중…' : 'Google 계정으로 시작하기'}
    </button>
    {error && <p className="error" role="alert">{error}</p>}
  </>
}
