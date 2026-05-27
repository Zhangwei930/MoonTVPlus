import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { markUserActive } from '@/lib/user-activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  const username = authInfo?.username;
  if (!username) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  markUserActive(username);
  return NextResponse.json({ ok: true });
}
