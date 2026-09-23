import { redirect } from 'next/navigation'
import { authorizedUser, isOwner } from '@/lib/auth'
import { recentArticles } from '@/lib/generation'
import { listRegenerationRequests } from '@/lib/regeneration'
import { ReadlyApp } from './readly-app'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  let user: { id: string; email: string }
  try {
    user = await authorizedUser()
  } catch {
    redirect('/login')
  }
  const [articles, regeneration] = await Promise.all([
    recentArticles(), listRegenerationRequests(isOwner(user.email)),
  ])
  return <ReadlyApp email={user.email} owner={isOwner(user.email)} initialArticles={articles}
    initialRegeneration={regeneration} />
}
