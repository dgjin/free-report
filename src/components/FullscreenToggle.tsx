import React, { useCallback, useEffect, useState } from 'react';
import { Maximize2, Minimize2 } from './icons';

/**
 * 全屏展示状态管理：ESC 可退出，全屏期间锁定页面背景滚动。
 * 供填报 / 复核 / 审核 / 查看各环节的数据区使用，确保宽表数据完整展示。
 */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isFullscreen]);

  const toggleFullscreen = useCallback(() => setIsFullscreen((v) => !v), []);
  const exitFullscreen = useCallback(() => setIsFullscreen(false), []);
  return { isFullscreen, toggleFullscreen, exitFullscreen };
}

/** 全屏切换按钮：进入/退出同一入口；withLabel 时显示文字 */
export const FullscreenButton: React.FC<{
  isFullscreen: boolean;
  onToggle: () => void;
  withLabel?: boolean;
}> = ({ isFullscreen, onToggle, withLabel = false }) => (
  <button
    type="button"
    onClick={onToggle}
    title={isFullscreen ? '退出全屏（Esc）' : '全屏显示'}
    aria-label={isFullscreen ? '退出全屏' : '全屏显示'}
    className={`h-8 inline-flex items-center justify-center gap-1.5 bg-canvas hover:bg-line text-ink rounded-md transition-colors shrink-0 ${
      withLabel ? 'px-3 text-xs font-medium' : 'w-8'
    }`}
  >
    {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
    {withLabel && <span>{isFullscreen ? '退出全屏' : '全屏查看'}</span>}
  </button>
);

/**
 * 数据区容器 className：全屏时固定铺满视口（高于审批/查看弹窗 z-50，低于全局 toast z-9999）、
 * 去除圆角并允许内部纵向滚动。
 */
export function fullscreenSectionClass(isFullscreen: boolean, normal: string): string {
  return isFullscreen ? 'fixed inset-0 z-[80] overflow-y-auto' : normal;
}
