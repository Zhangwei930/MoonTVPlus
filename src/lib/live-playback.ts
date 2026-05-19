type BlackScreenInput = {
  currentTime: number;
  paused: boolean;
  videoWidth: number;
};

function normalizeCodec(codec: unknown): string {
  return typeof codec === 'string' ? codec.trim().toLowerCase() : '';
}

function getCodecCandidates(level: unknown): string[] {
  if (!level || typeof level !== 'object') return [];

  const record = level as Record<string, unknown>;
  const attrs =
    record.attrs && typeof record.attrs === 'object'
      ? (record.attrs as Record<string, unknown>)
      : {};

  return [
    record.videoCodec,
    record.codecSet,
    attrs.CODECS,
    attrs.codecs,
  ]
    .map(normalizeCodec)
    .filter(Boolean);
}

export function isUnsupportedLiveVideoCodec(codec: unknown): boolean {
  const normalized = normalizeCodec(codec);
  if (!normalized) return false;

  return normalized.split(',').some((part) => {
    const item = part.trim();
    return (
      item.startsWith('hvc1') ||
      item.startsWith('hev1') ||
      item.startsWith('hvc') ||
      item.startsWith('hev') ||
      item.startsWith('dvh1') ||
      item.startsWith('dvhe')
    );
  });
}

export function isSupportedLiveVideoCodec(codec: unknown): boolean {
  const normalized = normalizeCodec(codec);
  if (!normalized) return false;

  return normalized.split(',').some((part) => {
    const item = part.trim();
    return (
      item.startsWith('avc1') ||
      item.startsWith('avc3') ||
      item.startsWith('h264')
    );
  });
}

export function findSupportedLiveVideoLevel(levels: unknown): number | null {
  if (!Array.isArray(levels)) return null;

  let selectedIndex: number | null = null;
  let selectedBitrate = -1;

  levels.forEach((level, index) => {
    const isSupported = getCodecCandidates(level).some(
      isSupportedLiveVideoCodec
    );
    if (!isSupported) return;

    const bitrate =
      level &&
      typeof level === 'object' &&
      typeof (level as { bitrate?: unknown }).bitrate === 'number'
        ? (level as { bitrate: number }).bitrate
        : 0;
    if (selectedIndex === null || bitrate > selectedBitrate) {
      selectedIndex = index;
      selectedBitrate = bitrate;
    }
  });

  return selectedIndex;
}

export function findUnsupportedLiveVideoCodec(levels: unknown): string | null {
  if (!Array.isArray(levels)) return null;

  for (const level of levels) {
    const codec = getCodecCandidates(level).find(isUnsupportedLiveVideoCodec);
    if (codec) return codec;
  }

  return null;
}

export function shouldFallbackForBlackScreen({
  currentTime,
  paused,
  videoWidth,
}: BlackScreenInput): boolean {
  return !paused && currentTime > 0.5 && videoWidth === 0;
}
