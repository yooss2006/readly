import type { Metadata } from 'next'
import '@fontsource/gowun-batang/korean-400.css'
import { invitationIsActive } from '@/lib/invitations'
import { InvitationExperience } from './invitation-experience'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: '당신에게 도착한 초대장 · Readly',
  referrer: 'no-referrer',
}

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const active = await invitationIsActive(token)
  return <InvitationExperience token={active ? token : null} />
}
