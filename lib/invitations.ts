import { createHash, randomBytes } from 'node:crypto'
import { adminSupabase } from './supabase'
import { ServiceError } from './types'

const TOKEN = /^[A-Za-z0-9_-]{43}$/

export type Invitation = {
  id: string
  createdAt: string
  expiresAt: string
  consumedAt: string | null
  revokedAt: string | null
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function invitationIsActive(token: string) {
  if (!TOKEN.test(token)) return false
  const { data, error } = await adminSupabase().from('invitation_links')
    .select('expires_at, consumed_at, revoked_at').eq('token_hash', hashToken(token)).maybeSingle()
  if (error) throw error
  return !!data && !data.consumed_at && !data.revoked_at && new Date(data.expires_at).getTime() > Date.now()
}

export async function createInvitation(ownerId: string) {
  const token = randomBytes(32).toString('base64url')
  const { data, error } = await adminSupabase().rpc('create_invitation', {
    p_owner: ownerId, p_hash: hashToken(token),
  })
  if (error) throw error
  if (data?.state !== 'created') throw new ServiceError('초대장을 생성할 수 없습니다.', 403)
  return { id: data.id as string, path: `/invite/${token}`, expiresAt: data.expires_at as string }
}

export async function listInvitations(): Promise<Invitation[]> {
  const db = adminSupabase()
  const columns = 'id, created_at, expires_at, consumed_at, revoked_at'
  const [pending, recent] = await Promise.all([
    db.from('invitation_links').select(columns).is('consumed_at', null).is('revoked_at', null)
      .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }),
    db.from('invitation_links').select(columns).order('created_at', { ascending: false }).limit(30),
  ])
  if (pending.error) throw pending.error
  if (recent.error) throw recent.error
  const rows = [...new Map([...(pending.data ?? []), ...(recent.data ?? [])].map(row => [row.id, row])).values()]
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at))
  return rows.map(row => ({
    id: row.id, createdAt: row.created_at, expiresAt: row.expires_at,
    consumedAt: row.consumed_at, revokedAt: row.revoked_at,
  }))
}

export async function revokeInvitation(ownerId: string, id: string) {
  const { data, error } = await adminSupabase().rpc('revoke_invitation', {
    p_owner: ownerId, p_id: id,
  })
  if (error) throw error
  if (data?.state !== 'revoked') throw new ServiceError('이미 사용되었거나 만료된 초대장입니다.', 409)
}

export async function redeemInvitation(userId: string, token: string): Promise<'redeemed' | 'already_invited' | 'invalid'> {
  if (!TOKEN.test(token)) return 'invalid'
  const { data, error } = await adminSupabase().rpc('redeem_invitation', {
    p_user: userId, p_hash: hashToken(token),
  })
  if (error) throw error
  return data?.state === 'redeemed' || data?.state === 'already_invited' ? data.state : 'invalid'
}
