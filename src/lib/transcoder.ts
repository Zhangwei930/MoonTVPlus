/* eslint-disable no-console */

import { ChildProcess,spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { access, mkdir, rm } from 'fs/promises';
import os from 'os';
import path from 'path';

const TRANSCODE_ROOT = path.join(os.tmpdir(), 'moontv-transcode');
const SESSION_TTL_MS = 5 * 60 * 1000;
const FIRST_SEGMENT_TIMEOUT_MS = 25_000;
const POLL_INTERVAL_MS = 300;
const KILL_GRACE_MS = 3_000;
const STDERR_TAIL_BYTES = 4_096;
const SAFE_FILE_PATTERN = /^(?:index\.m3u8|seg_\d+\.ts)$/;

interface TranscodeSession {
  id: string;
  process: ChildProcess;
  workDir: string;
  lastAccess: number;
  stderrTail: string;
}

const sessions = new Map<string, TranscodeSession>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendStderr(session: TranscodeSession, chunk: string): void {
  session.stderrTail = (session.stderrTail + chunk).slice(-STDERR_TAIL_BYTES);
}

export function buildTranscodeFfmpegArgs(
  upstreamUrl: string,
  userAgent: string,
  workDir: string
): string[] {
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '2',
    '-user_agent', userAgent,
    '-fflags', '+genpts+discardcorrupt',
    '-analyzeduration', '10000000',
    '-probesize', '10000000',
    '-i', upstreamUrl,
    '-map', '0:v:0?',
    '-map', '0:a:0?',
    '-sn',
    '-dn',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-pix_fmt', 'yuv420p',
    '-profile:v', 'main',
    '-crf', '28',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ac', '2',
    '-max_muxing_queue_size', '1024',
    '-sc_threshold', '0',
    '-g', '60',
    '-f', 'hls',
    '-hls_time', '4',
    '-hls_list_size', '6',
    '-hls_segment_type', 'mpegts',
    '-hls_flags', 'delete_segments+omit_endlist+independent_segments',
    '-hls_segment_filename', path.join(workDir, 'seg_%d.ts'),
    path.join(workDir, 'index.m3u8'),
  ];
}

export function isValidTranscodeFile(name: string): boolean {
  return SAFE_FILE_PATTERN.test(name);
}

export async function startTranscodeSession(
  upstreamUrl: string,
  userAgent: string
): Promise<{ sessionId: string }> {
  const sessionId = randomUUID();
  const workDir = path.join(TRANSCODE_ROOT, sessionId);
  await mkdir(workDir, { recursive: true });

  const proc = spawn('ffmpeg', buildTranscodeFfmpegArgs(upstreamUrl, userAgent, workDir), {
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  const session: TranscodeSession = {
    id: sessionId,
    process: proc,
    workDir,
    lastAccess: Date.now(),
    stderrTail: '',
  };
  sessions.set(sessionId, session);

  proc.stderr?.on('data', (chunk: Buffer) => {
    appendStderr(session, chunk.toString());
  });

  proc.on('error', (err) => {
    appendStderr(session, `\n[spawn error] ${err.message}`);
  });

  proc.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      console.warn(
        `[transcode] ffmpeg ${sessionId} exited code=${code} signal=${signal ?? ''}`
      );
    }
    cleanupSession(sessionId).catch(() => undefined);
  });

  ensureSweeper();

  const playlistPath = path.join(workDir, 'index.m3u8');
  const firstSegmentPath = path.join(workDir, 'seg_0.ts');
  const deadline = Date.now() + FIRST_SEGMENT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (proc.exitCode !== null || proc.signalCode) {
      const detail = session.stderrTail.trim().slice(-400) || '(no stderr output)';
      sessions.delete(sessionId);
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
      throw new Error(
        `ffmpeg exited before producing output: ${detail}`
      );
    }
    try {
      await access(playlistPath);
      await access(firstSegmentPath);
      session.lastAccess = Date.now();
      return { sessionId };
    } catch {
      await sleep(POLL_INTERVAL_MS);
    }
  }

  await cleanupSession(sessionId);
  throw new Error('ffmpeg timed out waiting for the first segment');
}

export function getSessionDir(sessionId: string): string | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  session.lastAccess = Date.now();
  return session.workDir;
}

async function cleanupSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;
  sessions.delete(sessionId);

  try {
    if (session.process.exitCode === null && !session.process.signalCode) {
      session.process.kill('SIGTERM');
      await sleep(KILL_GRACE_MS);
      if (session.process.exitCode === null && !session.process.signalCode) {
        session.process.kill('SIGKILL');
      }
    }
  } catch {
    // ignore — process may already be gone
  }

  await rm(session.workDir, { recursive: true, force: true }).catch(
    () => undefined
  );
}

function ensureSweeper(): void {
  const g = globalThis as unknown as { __moontvTranscodeSweeper?: NodeJS.Timeout };
  if (g.__moontvTranscodeSweeper) return;

  g.__moontvTranscodeSweeper = setInterval(() => {
    const now = Date.now();
    Array.from(sessions.entries()).forEach(([id, session]) => {
      if (now - session.lastAccess > SESSION_TTL_MS) {
        cleanupSession(id).catch(() => undefined);
      }
    });
  }, 60_000);

  const onExit = () => {
    for (const id of Array.from(sessions.keys())) {
      cleanupSession(id).catch(() => undefined);
    }
  };
  process.once('SIGINT', onExit);
  process.once('SIGTERM', onExit);
  process.once('beforeExit', onExit);
}
