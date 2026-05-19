type BlackScreenInput = {
  currentTime: number;
  paused: boolean;
  videoWidth: number;
};

function normalizeCodec(codec: unknown): string {
  return typeof codec === 'string' ? codec.trim().toLowerCase() : '';
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

export function findUnsupportedLiveVideoCodec(levels: unknown): string | null {
  if (!Array.isArray(levels)) return null;

  for (const level of levels) {
    if (!level || typeof level !== 'object') continue;

    const record = level as Record<string, unknown>;
    const attrs =
      record.attrs && typeof record.attrs === 'object'
        ? (record.attrs as Record<string, unknown>)
        : {};
    const candidates = [
      record.videoCodec,
      record.codecSet,
      attrs.CODECS,
      attrs.codecs,
    ];

    const codec = candidates
      .map(normalizeCodec)
      .find(isUnsupportedLiveVideoCodec);
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
