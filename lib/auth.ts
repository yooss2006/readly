import { adminSupabase, serverSupabase } from './supabase'
import { ServiceError } from './types'

export const OWNER_EMAIL = 'yoofh2006@gmail.com'

export function isOwner(email: string) {
  return email.toLowerCase() === OWNER_EMAIL
}

export async function authorizedUser() {
  const supabase = await serverSupabase()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user?.email || !data.user.email_confirmed_at) {
    throw new ServiceError('로그인이 필요합니다.', 401, 'login_required')
  }
  const email = data.user.email.toLowerCase()
  const { data: invited, error: inviteError } = await adminSupabase()
    .from('allowed_emails').select('email').eq('email', email).maybeSingle()
  if (inviteError) throw inviteError
  if (!invited) throw new ServiceError('초대된 계정만 이용할 수 있습니다.', 403, 'not_invited')
  return { id: data.user.id, email }
}
