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
    // 以最近的滚动祖先（通常是 <main>）为 root，避免 overflow-y:auto 容器内
    // 元素相对 viewport 位置不在可见区导致 isIntersecting 永远为 false
    const main = document.querySelector('main') || document.documentElement;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal-in');
            io.unobserve(entry.target);
          }
        });
      },
      { root: main, threshold: 0.01 },
    );

    const scan = () => {
      document
        .querySelectorAll('main .reveal:not(.reveal-in), [data-reveal-root] .reveal:not(.reveal-in)')
        .forEach((el) => io.observe(el));
    };

    const timer = window.setTimeout(scan, 40);
    const mo = new MutationObserver(() => scan());
    mo.observe(main, { childList: true, subtree: true });

    // 兜底：数据异步到达但 MutationObserver 漏扫或元素初始高度为 0 导致
    // isIntersecting=false 的场景，1.5s 后强制显示所有仍未 reveal 的元素
    const fallback = window.setTimeout(() => {
      document
        .querySelectorAll('main .reveal:not(.reveal-in), [data-reveal-root] .reveal:not(.reveal-in)')
        .forEach((el) => el.classList.add('reveal-in'));
    }, 1500);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(fallback);
      mo.disconnect();
      io.disconnect();
    };
  }, [location.pathname]);
}
