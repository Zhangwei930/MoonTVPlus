import {
  findUnsupportedLiveVideoCodec,
  isUnsupportedLiveVideoCodec,
  shouldFallbackForBlackScreen,
} from '@/lib/live-playback';

describe('live playback codec helpers', () => {
  it('detects HEVC and Dolby Vision codec strings as unsupported live video', () => {
    expect(isUnsupportedLiveVideoCodec('hvc1.1.6.L123.B0')).toBe(true);
    expect(isUnsupportedLiveVideoCodec('hev1.1.6.L123.B0')).toBe(true);
    expect(isUnsupportedLiveVideoCodec('dvh1.05.06')).toBe(true);
    expect(isUnsupportedLiveVideoCodec('avc1.640028')).toBe(false);
  });

  it('finds unsupported video codecs in parsed HLS levels', () => {
    expect(
      findUnsupportedLiveVideoCodec([
        { videoCodec: 'avc1.640028' },
        { codecSet: 'hvc1.1.6.L123.B0,mp4a.40.2' },
      ])
    ).toBe('hvc1.1.6.l123.b0,mp4a.40.2');
  });

  it('falls back only when playback is moving but no video dimensions appear', () => {
    expect(
      shouldFallbackForBlackScreen({
        currentTime: 3,
        paused: false,
        videoWidth: 0,
      })
    ).toBe(true);

    expect(
      shouldFallbackForBlackScreen({
        currentTime: 3,
        paused: false,
        videoWidth: 1920,
      })
    ).toBe(false);

    expect(
      shouldFallbackForBlackScreen({
        currentTime: 0.2,
        paused: false,
        videoWidth: 0,
      })
    ).toBe(false);
  });
});
