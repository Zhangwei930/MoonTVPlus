'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  isImageFailedRecently,
  markImageFailed,
} from '@/lib/failed-image-cache';
import {
  clearBangumiImageFallbackCacheIfFailed,
  processImageUrl,
  tryApplyBangumiImageFallback,
  tryApplyDoubanImageFallback,
} from '@/lib/utils';

// 已知坏图的占位图（浅灰色），避免对坏 URL 反复发起请求
export const FAILED_IMAGE_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450'%3E%3Crect width='100%25' height='100%25' fill='%23e5e7eb'/%3E%3C/svg%3E";

interface ProxyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  originalSrc: string;
  displaySrc?: string;
  retryDelay?: number;
  retryOnError?: boolean;
}

const ProxyImage: React.FC<ProxyImageProps> = ({
  originalSrc,
  displaySrc,
  retryDelay = 2000,
  retryOnError = true,
  loading = 'lazy',
  decoding = 'async',
  onError,
  src: _src,
  ...props
}) => {
  const initialSrc = useMemo(() => {
    if (isImageFailedRecently(originalSrc)) {
      return FAILED_IMAGE_PLACEHOLDER;
    }
    return displaySrc || processImageUrl(originalSrc);
  }, [displaySrc, originalSrc]);
  const [currentSrc, setCurrentSrc] = useState(initialSrc);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setCurrentSrc(initialSrc);
  }, [initialSrc]);

  useEffect(() => {
    if (displaySrc || currentSrc === FAILED_IMAGE_PLACEHOLDER) return;

    const timer = window.setTimeout(() => {
      const img = imgRef.current;
      if (!img || img.complete || img.dataset.bangumiBackupTried === 'true') {
        return;
      }

      if (tryApplyBangumiImageFallback(img, originalSrc)) {
        setCurrentSrc(img.src);
      }
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [currentSrc, displaySrc, originalSrc]);

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const img = e.currentTarget;

    if (
      tryApplyDoubanImageFallback(img, originalSrc) ||
      tryApplyBangumiImageFallback(img, originalSrc)
    ) {
      setCurrentSrc(img.src);
      return;
    }

    if (clearBangumiImageFallbackCacheIfFailed(img, originalSrc)) {
      setCurrentSrc(processImageUrl(originalSrc));
      return;
    }

    if (retryOnError && !img.dataset.retried) {
      img.dataset.retried = 'true';
      window.setTimeout(() => {
        setCurrentSrc(initialSrc);
      }, retryDelay);
    } else {
      // 所有降级与重试手段用尽，记录坏图，短期内不再对同一 URL 发请求
      markImageFailed(originalSrc);
    }

    onError?.(e);
  };

  return (
    <img
      {...props}
      ref={imgRef}
      src={currentSrc}
      loading={loading}
      decoding={decoding}
      onError={handleError}
    />
  );
};

export default ProxyImage;
