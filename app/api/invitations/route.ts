import { NextResponse, type NextRequest } from 'next/server'
import { authorizedUser, isOwner } from '@/lib/auth'
import { createInvitation, listInvitations, revokeInvitation } from '@/lib/invitations'
import { ServiceError } from '@/lib/types'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const noStore = { 'Cache-Control': 'no-store' }

function failed(error: unknown) {
  return error instanceof ServiceError
    ? NextResponse.json({ error: error.message }, { status: error.status, headers: noStore })
    : NextResponse.json({ error: '초대장을 처리하지 못했습니다.' }, { status: 500, headers: noStore })
}

async function ownerId() {
  const user = await authorizedUser()
  if (!isOwner(user.email)) throw new ServiceError('방장만 초대장을 관리할 수 있습니다.', 403)
  return user.id
}

export async function GET() {
  try {
    await ownerId()
    return NextResponse.json({ invitations: await listInvitations() }, { headers: noStore })
  } catch (error) { return failed(error) }
}

export async function POST() {
  try {
    const id = await ownerId()
    return NextResponse.json(await createInvitation(id), { status: 201, headers: noStore })
  } catch (error) { return failed(error) }
}

export async function DELETE(request: NextRequest) {
  try {
    const owner = await ownerId()
    const body = await request.json() as { id?: unknown }
    if (typeof body.id !== 'string' || !uuid.test(body.id)) {
      throw new ServiceError('초대장을 다시 선택해 주세요.', 400)
    }
    await revokeInvitation(owner, body.id)
    return NextResponse.json({ state: 'revoked' }, { headers: noStore })
  } catch (error) { return failed(error) }
}
