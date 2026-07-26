import React, { useEffect, useState } from 'react';

/**
 * 轻量 toast 通知系统，替代原生 alert/confirm：
 * - 不阻塞 JS 主线程与页面交互
 * - toast：右上角滑入，3.2s 自动消失
 * - confirmDialog：Promise 版确认框，await 获取用户选择
 */

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ConfirmRequest {
  id: number;
  message: string;
  resolve: (value: boolean) => void;
}

let nextId = 1;
const toastListeners = new Set<(t: ToastItem) => void>();
const confirmListeners = new Set<(c: ConfirmRequest) => void>();

/** 轻提示（替代 alert） */
export function toast(message: string, type: ToastType = 'info') {
  const item: ToastItem = { id: nextId++, message, type };
  toastListeners.forEach((fn) => fn(item));
}

/** Promise 版确认框（替代 confirm），用法：if (!(await confirmDialog('...'))) return; */
export function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req: ConfirmRequest = { id: nextId++, message, resolve };
    confirmListeners.forEach((fn) => fn(req));
  });
}

interface PromptRequest {
  id: number;
  message: string;
  placeholder?: string;
  resolve: (value: string | null) => void;
}

const promptListeners = new Set<(p: PromptRequest) => void>();

/** Promise 版输入框（替代 prompt），返回输入文本或 null（取消） */
export function promptDialog(message: string, placeholder?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const req: PromptRequest = { id: nextId++, message, placeholder, resolve };
    promptListeners.forEach((fn) => fn(req));
  });
}

/* Muted pastel 语义色 */
const typeStyles: Record<ToastType, { bar: string; icon: string }> = {
  success: { bar: '#346538', icon: '✓' },
  error: { bar: '#9F2F2D', icon: '✕' },
  info: { bar: '#1F6C9F', icon: 'ℹ' },
};

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--hairline)',
  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
};

const overlayStyle: React.CSSProperties = {
  background: 'rgba(17,17,17,0.24)',
};

const primaryBtnCls =
  'px-4 h-9 rounded-md text-[13px] font-medium text-white bg-ink hover:bg-inkhover active:scale-[0.98] transition-all';
const ghostBtnCls =
  'px-4 h-9 rounded-md text-[13px] font-medium text-body bg-canvas hover:bg-[#EFEEEB] border border-line transition-colors';

const PromptCard: React.FC<{
  req: PromptRequest;
  onClose: (req: PromptRequest, value: string | null) => void;
}> = ({ req, onClose }) => {
  const [value, setValue] = useState('');
  return (
    <div className="toast-pop-in w-[380px] rounded-xl p-5" style={cardStyle}>
      <div className="text-[14px] font-semibold text-ink mb-3">{req.message}</div>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onClose(req, value);
          if (e.key === 'Escape') onClose(req, null);
        }}
        placeholder={req.placeholder}
        className="w-full h-10 px-3 rounded-md border border-line text-[13px] text-body outline-none focus:border-ink mb-4"
      />
      <div className="flex justify-end gap-2">
        <button onClick={() => onClose(req, null)} className={ghostBtnCls}>
          取消
        </button>
        <button onClick={() => onClose(req, value)} className={primaryBtnCls}>
          确认
        </button>
      </div>
    </div>
  );
};

export const ToastHost: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirms, setConfirms] = useState<ConfirmRequest[]>([]);
  const [prompts, setPrompts] = useState<PromptRequest[]>([]);

  useEffect(() => {
    const onToast = (t: ToastItem) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 3200);
    };
    const onConfirm = (c: ConfirmRequest) => setConfirms((prev) => [...prev, c]);
    const onPrompt = (p: PromptRequest) => setPrompts((prev) => [...prev, p]);
    toastListeners.add(onToast);
    confirmListeners.add(onConfirm);
    promptListeners.add(onPrompt);
    return () => {
      toastListeners.delete(onToast);
      confirmListeners.delete(onConfirm);
      promptListeners.delete(onPrompt);
    };
  }, []);

  const closeConfirm = (req: ConfirmRequest, value: boolean) => {
    setConfirms((prev) => prev.filter((x) => x.id !== req.id));
    req.resolve(value);
  };

  const closePrompt = (req: PromptRequest, value: string | null) => {
    setPrompts((prev) => prev.filter((x) => x.id !== req.id));
    req.resolve(value);
  };

  return (
    <>
      {/* toast 栈：右上角滑入 */}
      <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => {
          const s = typeStyles[t.type];
          return (
            <div
              key={t.id}
              className="toast-slide-in pointer-events-auto flex items-stretch min-w-[240px] max-w-[380px] rounded-lg overflow-hidden"
              style={cardStyle}
            >
              <div className="w-1" style={{ background: s.bar }} />
              <div className="flex items-center gap-2.5 px-3.5 py-3">
                <span
                  className="w-5 h-5 rounded-full text-white text-[11px] font-bold flex items-center justify-center shrink-0"
                  style={{ background: s.bar }}
                >
                  {s.icon}
                </span>
                <span className="text-[13px] text-body leading-snug">{t.message}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* prompt 输入框：居中弹层，不阻塞页面 JS */}
      {prompts.length > 0 && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center" style={overlayStyle}>
          {prompts.map((p) => (
            <PromptCard key={p.id} req={p} onClose={closePrompt} />
          ))}
        </div>
      )}

      {/* confirm 对话框：居中弹层，不阻塞页面 JS */}
      {confirms.length > 0 && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center" style={overlayStyle}>
          {confirms.map((c) => (
            <div key={c.id} className="toast-pop-in w-[380px] rounded-xl p-5" style={cardStyle}>
              <div className="text-[14px] font-semibold text-ink mb-1.5">操作确认</div>
              <div className="text-[13px] text-mute leading-relaxed mb-4">{c.message}</div>
              <div className="flex justify-end gap-2">
                <button onClick={() => closeConfirm(c, false)} className={ghostBtnCls}>
                  取消
                </button>
                <button onClick={() => closeConfirm(c, true)} className={primaryBtnCls}>
                  确认
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};
