import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * 滚动进入动效（IntersectionObserver 驱动，不用 scroll 监听）：
 * - 页面内 .reveal 元素进入视口时追加 .reveal-in（CSS 负责过渡）
 * - MutationObserver 兜底 SWR 数据到达后新渲染的 .reveal 节点
 * - 路由切换时自动重扫
 */
export function useRevealObserver() {
  const location = useLocation();

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal-in');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.06 },
    );

    const scan = () => {
      document
        .querySelectorAll('main .reveal:not(.reveal-in), [data-reveal-root] .reveal:not(.reveal-in)')
        .forEach((el) => io.observe(el));
    };

    const timer = window.setTimeout(scan, 40);
    const main = document.querySelector('main');
    const mo = new MutationObserver(() => scan());
    if (main) mo.observe(main, { childList: true, subtree: true });

    return () => {
      window.clearTimeout(timer);
      mo.disconnect();
      io.disconnect();
    };
  }, [location.pathname]);
}
