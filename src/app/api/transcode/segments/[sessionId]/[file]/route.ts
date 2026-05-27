import { readFile } from 'fs/promises';
import { NextRequest } from 'next/server';
import path from 'path';

import { getSessionDir, isValidTranscodeFile } from '@/lib/transcoder';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: { sessionId: string; file: string } }
) {
  const file = path.basename(params.file);
  if (!isValidTranscodeFile(file)) {
    return new Response('Bad request', { status: 400 });
  }

  const dir = getSessionDir(params.sessionId);
  if (!dir) {
    return new Response('Session not found', { status: 404 });
  }

  try {
    const data = await readFile(path.join(dir, file));
    const isPlaylist = file.endsWith('.m3u8');
    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': isPlaylist
          ? 'application/vnd.apple.mpegurl'
          : 'video/mp2t',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': isPlaylist ? 'no-cache' : 'public, max-age=10',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
