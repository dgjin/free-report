import React, { useState } from 'react';

/**
 * 配色主题切换器 — 暖白(默认) / 海蓝
 * 通过 <html data-theme> 切换 CSS 变量组，选择持久化到 localStorage。
 * 初始主题由 index.html 内联脚本在首帧前写入 data-theme，避免闪烁。
 */

type ThemeName = 'warm' | 'blue';

const STORAGE_KEY = 'free_report_theme';

const THEMES: { id: ThemeName; label: string; canvas: string; ink: string }[] = [
  { id: 'warm', label: '暖白主题', canvas: '#F7F6F3', ink: '#111111' },
  { id: 'blue', label: '海蓝主题', canvas: '#F0F5FA', ink: '#003775' },
];

const currentTheme = (): ThemeName =>
  document.documentElement.dataset.theme === 'blue' ? 'blue' : 'warm';

export const ThemeSwitcher: React.FC = () => {
  const [theme, setTheme] = useState<ThemeName>(currentTheme);

  const apply = (next: ThemeName) => {
    setTheme(next);
    if (next === 'warm') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* 私密模式等场景下静默失败 */
    }
  };

  return (
    <div
      className="flex items-center gap-0.5 p-0.5 rounded-full border border-line bg-surface"
      role="radiogroup"
      aria-label="配色主题"
      title="切换配色主题"
    >
      {THEMES.map((t) => {
        const active = theme === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={t.label}
            title={t.label}
            onClick={() => apply(t.id)}
            className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
              active ? 'bg-canvas ring-1 ring-ink' : 'hover:bg-canvas'
            }`}
          >
            <span
              className="w-3.5 h-3.5 rounded-full flex items-center justify-center border border-line"
              style={{ background: t.canvas }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.ink }} />
            </span>
          </button>
        );
      })}
    </div>
  );
};
