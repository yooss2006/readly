import { redirect } from 'next/navigation'
import { authorizedUser } from '@/lib/auth'
import { recentArticles } from '@/lib/generation'
import { ReadlyApp } from './readly-app'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  let user: { id: string; email: string }
  try {
    user = await authorizedUser()
  } catch {
    redirect('/login')
  }
  const articles = await recentArticles()
  return <ReadlyApp email={user.email} initialArticles={articles} />
}
