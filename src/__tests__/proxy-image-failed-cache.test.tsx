import { fireEvent, render } from '@testing-library/react';
import React from 'react';

import {
  clearFailedImageCache,
  isImageFailedRecently,
  markImageFailed,
} from '@/lib/failed-image-cache';

import ProxyImage, { FAILED_IMAGE_PLACEHOLDER } from '@/components/ProxyImage';

// 普通 URL（非豆瓣/Bangumi），不会触发备用源逻辑
const BAD_URL = 'https://img.example.com/dead-poster.jpg';

describe('ProxyImage 与失败缓存集成', () => {
  beforeEach(() => {
    clearFailedImageCache();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('已知坏图直接渲染占位图，不请求原始 URL', () => {
    markImageFailed(BAD_URL);

    const { container } = render(
      <ProxyImage originalSrc={BAD_URL} alt='poster' />
    );
    const img = container.querySelector('img') as HTMLImageElement;

    expect(img.getAttribute('src')).toBe(FAILED_IMAGE_PLACEHOLDER);
  });

  it('重试用尽后把 URL 记入失败缓存', () => {
    const { container } = render(
      <ProxyImage originalSrc={BAD_URL} alt='poster' />
    );
    const img = container.querySelector('img') as HTMLImageElement;

    expect(img.getAttribute('src')).toBe(BAD_URL);

    // 第一次失败：安排重试，尚未记入缓存
    fireEvent.error(img);
    expect(isImageFailedRecently(BAD_URL)).toBe(false);

    jest.advanceTimersByTime(2100);

    // 重试后再次失败：记入缓存
    fireEvent.error(img);
    expect(isImageFailedRecently(BAD_URL)).toBe(true);
  });

  it('关闭重试时首次失败即记入缓存', () => {
    const { container } = render(
      <ProxyImage originalSrc={BAD_URL} alt='poster' retryOnError={false} />
    );
    const img = container.querySelector('img') as HTMLImageElement;

    fireEvent.error(img);
    expect(isImageFailedRecently(BAD_URL)).toBe(true);
  });

  it('最终失败时通过 sendBeacon 上报失败 URL', () => {
    const sendBeacon = jest.fn().mockReturnValue(true);
    (navigator as any).sendBeacon = sendBeacon;

    const { container } = render(
      <ProxyImage originalSrc={BAD_URL} alt='poster' retryOnError={false} />
    );
    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0][0]).toBe('/api/image-failures');

    delete (navigator as any).sendBeacon;
  });

  it('未失败过的图片正常使用原始 URL', () => {
    const { container } = render(
      <ProxyImage originalSrc={BAD_URL} alt='poster' />
    );
    const img = container.querySelector('img') as HTMLImageElement;

    expect(img.getAttribute('src')).toBe(BAD_URL);
  });
});
