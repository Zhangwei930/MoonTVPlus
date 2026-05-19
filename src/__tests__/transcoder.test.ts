import { buildTranscodeFfmpegArgs, isValidTranscodeFile } from '@/lib/transcoder';

describe('isValidTranscodeFile', () => {
  it('accepts the playlist and numbered segment files', () => {
    expect(isValidTranscodeFile('index.m3u8')).toBe(true);
    expect(isValidTranscodeFile('seg_0.ts')).toBe(true);
    expect(isValidTranscodeFile('seg_42.ts')).toBe(true);
    expect(isValidTranscodeFile('seg_9999.ts')).toBe(true);
  });

  it('rejects path traversal and unknown patterns', () => {
    expect(isValidTranscodeFile('../etc/passwd')).toBe(false);
    expect(isValidTranscodeFile('..')).toBe(false);
    expect(isValidTranscodeFile('Index.m3u8')).toBe(false);
    expect(isValidTranscodeFile('seg_0.ts.bak')).toBe(false);
    expect(isValidTranscodeFile('seg_.ts')).toBe(false);
    expect(isValidTranscodeFile('seg.ts')).toBe(false);
    expect(isValidTranscodeFile('')).toBe(false);
    expect(isValidTranscodeFile('index.m3u8/anything')).toBe(false);
    expect(isValidTranscodeFile('seg_0.ts\0.png')).toBe(false);
  });
});

describe('buildTranscodeFfmpegArgs', () => {
  it('forces browser-compatible H.264 output without failing early on delayed video stream discovery', () => {
    const args = buildTranscodeFfmpegArgs(
      'https://example.com/live/index.m3u8',
      'TestUA/1.0',
      '/tmp/moontv-transcode/session'
    );

    expect(args).toContain('-c:v');
    expect(args).toContain('libx264');
    expect(args).toContain('-pix_fmt');
    expect(args).toContain('yuv420p');
    expect(args).toContain('-map');
    expect(args).toContain('0:v:0?');
  });
});
